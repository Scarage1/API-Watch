"""
API-Watch CLI — Run API tests from your terminal.

Usage:
    apiwatch run collection.json              # Execute a collection
    apiwatch run collection.json -e prod.env  # With environment
    apiwatch init                              # Scaffold .apiwatch/ project
    apiwatch export --format curl              # Export as cURL commands
    apiwatch health                            # Check server health
    apiwatch version                           # Show version

Built with Click for ergonomic CLI experience.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import click
import httpx
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich import box

console = Console()
error_console = Console(stderr=True)

# ── Configuration ─────────────────────────────────────────────
DEFAULT_SERVER = os.getenv("APIWATCH_SERVER", "http://localhost:8000")


def get_version() -> str:
    """Read version from config or fallback."""
    try:
        from src.config import get_settings
        return get_settings().app_version
    except Exception:
        return "2.3.0"


# ── CLI Group ─────────────────────────────────────────────────
@click.group()
@click.option("--server", "-s", default=DEFAULT_SERVER, help="API-Watch server URL")
@click.option("--quiet", "-q", is_flag=True, help="Minimal output")
@click.pass_context
def cli(ctx: click.Context, server: str, quiet: bool):
    """⚡ API-Watch — The fastest self-hosted API client."""
    ctx.ensure_object(dict)
    ctx.obj["server"] = server.rstrip("/")
    ctx.obj["quiet"] = quiet


# ── apiwatch version ──────────────────────────────────────────
@cli.command()
def version():
    """Show API-Watch version."""
    ver = get_version()
    console.print(f"[bold cyan]API-Watch[/bold cyan] v{ver}")


# ── apiwatch health ───────────────────────────────────────────
@cli.command()
@click.pass_context
def health(ctx: click.Context):
    """Check API-Watch server health."""
    server = ctx.obj["server"]

    with console.status(f"Checking [bold]{server}[/bold]...", spinner="dots"):
        try:
            resp = httpx.get(f"{server}/health", timeout=5.0)
            data = resp.json()
        except httpx.ConnectError:
            error_console.print(f"[red]✗[/red] Cannot connect to {server}")
            raise SystemExit(1)
        except Exception as e:
            error_console.print(f"[red]✗[/red] Health check failed: {e}")
            raise SystemExit(1)

    status = data.get("status", "unknown")
    color = "green" if status == "healthy" else "yellow" if status == "degraded" else "red"

    table = Table(show_header=False, box=box.SIMPLE, padding=(0, 2))
    table.add_column("Key", style="dim")
    table.add_column("Value")

    table.add_row("Status", f"[{color}]{status}[/{color}]")
    table.add_row("Service", data.get("service", "—"))
    table.add_row("Version", data.get("version", "—"))

    checks = data.get("checks", {})
    for k, v in checks.items():
        check_color = "green" if v == "ok" else "red"
        table.add_row(f"  {k}", f"[{check_color}]{v}[/{check_color}]")

    console.print(Panel(table, title="[bold]Server Health[/bold]", border_style="cyan"))


# ── apiwatch init ─────────────────────────────────────────────
@cli.command()
@click.option("--name", "-n", prompt="Project name", help="Project name")
def init(name: str):
    """Scaffold a new .apiwatch/ project directory."""
    project_dir = Path(".apiwatch")

    if project_dir.exists():
        error_console.print("[yellow]⚠[/yellow]  .apiwatch/ already exists")
        raise SystemExit(1)

    # Create project structure
    dirs = [
        project_dir,
        project_dir / "collections",
        project_dir / "environments",
        project_dir / "scripts",
        project_dir / "reports",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)

    # Create project config
    config = {
        "name": name,
        "version": "1.0.0",
        "server": DEFAULT_SERVER,
        "defaultEnvironment": "dev",
        "collections": [],
    }
    (project_dir / "project.json").write_text(json.dumps(config, indent=2) + "\n")

    # Create example environment
    env = {
        "name": "dev",
        "variables": {
            "base_url": "http://localhost:8000",
            "api_key": "your-api-key-here",
        },
    }
    (project_dir / "environments" / "dev.json").write_text(json.dumps(env, indent=2) + "\n")

    # Create example collection
    collection = {
        "name": "Example",
        "requests": [
            {
                "name": "Health Check",
                "method": "GET",
                "url": "{{base_url}}/health",
            },
        ],
    }
    (project_dir / "collections" / "example.json").write_text(
        json.dumps(collection, indent=2) + "\n"
    )

    # Create .gitignore for secrets
    gitignore = "# API-Watch project\n*.env.local\n*.secrets\nreports/\n"
    (project_dir / ".gitignore").write_text(gitignore)

    console.print(f"\n[green]✓[/green] Project [bold]{name}[/bold] initialized\n")
    console.print("  Created:")
    for d in dirs:
        console.print(f"    [dim]{d}/[/dim]")
    console.print(f"    [dim]{project_dir}/project.json[/dim]")
    console.print(f"    [dim]{project_dir}/environments/dev.json[/dim]")
    console.print(f"    [dim]{project_dir}/collections/example.json[/dim]")
    console.print(f"\n  Next: [bold cyan]apiwatch run .apiwatch/collections/example.json[/bold cyan]")


# ── apiwatch run ──────────────────────────────────────────────
@cli.command()
@click.argument("collection", type=click.Path(exists=True))
@click.option("--env", "-e", "env_file", type=click.Path(exists=True), help="Environment file")
@click.option("--bail", is_flag=True, help="Stop on first failure")
@click.option("--timeout", "-t", default=30, help="Request timeout in seconds")
@click.option("--output", "-o", type=click.Path(), help="Save results to JSON file")
@click.pass_context
def run(
    ctx: click.Context,
    collection: str,
    env_file: Optional[str],
    bail: bool,
    timeout: int,
    output: Optional[str],
):
    """Execute a collection of API requests."""
    server = ctx.obj["server"]
    quiet = ctx.obj["quiet"]

    # Load collection
    try:
        with open(collection) as f:
            coll_data = json.load(f)
    except json.JSONDecodeError as e:
        error_console.print(f"[red]✗[/red] Invalid JSON in {collection}: {e}")
        raise SystemExit(1)

    # Load environment variables
    env_vars = {}
    if env_file:
        try:
            with open(env_file) as f:
                env_data = json.load(f)
                env_vars = env_data.get("variables", env_data)
        except json.JSONDecodeError as e:
            error_console.print(f"[red]✗[/red] Invalid JSON in {env_file}: {e}")
            raise SystemExit(1)

    requests_list = coll_data.get("requests", [])
    coll_name = coll_data.get("name", Path(collection).stem)

    if not requests_list:
        error_console.print("[yellow]⚠[/yellow]  No requests found in collection")
        raise SystemExit(0)

    if not quiet:
        console.print(f"\n[bold cyan]▶ Running:[/bold cyan] {coll_name}")
        console.print(f"  [dim]Requests: {len(requests_list)} | Server: {server}[/dim]")
        if env_vars:
            console.print(f"  [dim]Environment: {len(env_vars)} variables[/dim]")
        console.print()

    # Execute each request
    results = []
    passed = 0
    failed = 0
    total_time = 0.0

    client = httpx.Client(timeout=timeout)

    for i, req in enumerate(requests_list, 1):
        name = req.get("name", f"Request {i}")
        method = req.get("method", "GET").upper()
        url = req.get("url", "")

        # Simple variable interpolation
        for key, value in env_vars.items():
            url = url.replace(f"{{{{{key}}}}}", str(value))

        if not quiet:
            console.print(f"  [{i}/{len(requests_list)}] {method} {url}", end=" ")

        start = time.perf_counter()
        try:
            resp = client.request(
                method=method,
                url=url,
                headers=req.get("headers", {}),
                json=req.get("body") if method in ("POST", "PUT", "PATCH") else None,
                params=req.get("params", {}),
            )
            elapsed = (time.perf_counter() - start) * 1000
            total_time += elapsed

            success = resp.status_code < 400
            result = {
                "name": name,
                "method": method,
                "url": url,
                "status_code": resp.status_code,
                "response_time_ms": round(elapsed, 2),
                "success": success,
            }
            results.append(result)

            if success:
                passed += 1
                if not quiet:
                    console.print(f"[green]✓ {resp.status_code}[/green] [dim]({elapsed:.0f}ms)[/dim]")
            else:
                failed += 1
                if not quiet:
                    console.print(f"[red]✗ {resp.status_code}[/red] [dim]({elapsed:.0f}ms)[/dim]")
                if bail:
                    break

        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            total_time += elapsed
            failed += 1
            result = {
                "name": name,
                "method": method,
                "url": url,
                "status_code": None,
                "response_time_ms": round(elapsed, 2),
                "success": False,
                "error": str(e),
            }
            results.append(result)

            if not quiet:
                console.print(f"[red]✗ ERROR[/red] [dim]{e}[/dim]")
            if bail:
                break

    client.close()

    # Summary
    if not quiet:
        console.print()
        color = "green" if failed == 0 else "red"
        console.print(Panel(
            f"[{color}]{passed} passed[/{color}] · "
            f"{'[red]' + str(failed) + ' failed[/red]' if failed else '[dim]0 failed[/dim]'} · "
            f"[dim]{len(results)} total · {total_time:.0f}ms[/dim]",
            title="[bold]Results[/bold]",
            border_style=color,
        ))

    # Save results
    if output:
        report = {
            "collection": coll_name,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "summary": {
                "total": len(results),
                "passed": passed,
                "failed": failed,
                "total_time_ms": round(total_time, 2),
            },
            "results": results,
        }
        with open(output, "w") as f:
            json.dump(report, f, indent=2)
        if not quiet:
            console.print(f"\n  [dim]Report saved to {output}[/dim]")

    raise SystemExit(1 if failed > 0 else 0)


# ── apiwatch export ───────────────────────────────────────────
@cli.command()
@click.argument("collection", type=click.Path(exists=True))
@click.option("--format", "-f", "fmt", type=click.Choice(["curl", "json"]), default="curl")
@click.option("--env", "-e", "env_file", type=click.Path(exists=True), help="Environment file")
def export(collection: str, fmt: str, env_file: Optional[str]):
    """Export a collection as cURL commands or JSON."""
    try:
        with open(collection) as f:
            coll_data = json.load(f)
    except json.JSONDecodeError as e:
        error_console.print(f"[red]✗[/red] Invalid JSON: {e}")
        raise SystemExit(1)

    env_vars = {}
    if env_file:
        with open(env_file) as f:
            env_data = json.load(f)
            env_vars = env_data.get("variables", env_data)

    requests_list = coll_data.get("requests", [])

    if fmt == "curl":
        for req in requests_list:
            method = req.get("method", "GET").upper()
            url = req.get("url", "")
            for k, v in env_vars.items():
                url = url.replace(f"{{{{{k}}}}}", str(v))

            parts = [f"curl -X {method}"]
            for k, v in req.get("headers", {}).items():
                parts.append(f"  -H '{k}: {v}'")
            body = req.get("body")
            if body and method in ("POST", "PUT", "PATCH"):
                parts.append(f"  -d '{json.dumps(body)}'")
            parts.append(f"  '{url}'")

            name = req.get("name", "")
            if name:
                console.print(f"# {name}")
            console.print(" \\\n".join(parts))
            console.print()

    elif fmt == "json":
        console.print_json(json.dumps(coll_data, indent=2))


# ── Entry Point ───────────────────────────────────────────────
def main():
    cli(auto_envvar_prefix="APIWATCH")


if __name__ == "__main__":
    main()
