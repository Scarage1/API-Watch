"""
Main CLI entry point for API Debugging & Monitoring Toolkit.
Supports single requests and test suite execution.
"""
import sys
import argparse
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
import yaml
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from utils import (
    load_env, 
    get_env_var, 
    ensure_directory, 
    get_timestamp,
    safe_json_parse,
    format_duration,
    format_bytes
)
from auth import AuthHandler, create_auth_from_config
from retry import RetryConfig
from runner import APIRunner, RequestConfig, RequestResult
from diagnose import DiagnosisEngine
from report import ReportGenerator


console = Console()


def setup_logging(verbose: bool = False) -> logging.Logger:
    """
    Setup logging configuration.
    
    Args:
        verbose: Enable verbose logging
        
    Returns:
        Logger instance
    """
    log_dir = ensure_directory("logs")
    log_file = log_dir / f"api_debug_{get_timestamp()}.log"
    
    level = logging.DEBUG if verbose else logging.INFO
    
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler() if verbose else logging.NullHandler()
        ]
    )
    
    logger = logging.getLogger(__name__)
    logger.info(f"Logging initialized. Log file: {log_file}")
    
    return logger


def execute_single_request(args: argparse.Namespace, logger: logging.Logger) -> RequestResult:
    """
    Execute a single API request.
    
    Args:
        args: Command line arguments
        logger: Logger instance
        
    Returns:
        RequestResult
    """
    # Setup authentication
    auth_handler = None
    if args.bearer:
        auth_handler = AuthHandler()
        auth_handler.set_bearer_token(token=args.bearer)
    elif args.api_key:
        auth_handler = AuthHandler()
        auth_handler.set_api_key(api_key=args.api_key, header_name=args.api_key_header)
    
    # Setup retry config
    retry_config = RetryConfig(
        max_retries=args.retries,
        initial_delay=1.0
    )
    
    # Create runner
    runner = APIRunner(auth_handler, retry_config, logger)
    
    # Parse headers and body
    headers = safe_json_parse(args.headers) if args.headers else {}
    params = safe_json_parse(args.params) if args.params else {}
    body = safe_json_parse(args.body) if args.body else None
    
    # Create request config
    config = RequestConfig(
        method=args.method,
        url=args.url,
        headers=headers,
        params=params,
        body=body,
        timeout=args.timeout
    )
    
    # Execute request
    console.print(f"\n[bold cyan]Executing {args.method} request to:[/bold cyan] {args.url}")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:
        progress.add_task(description="Sending request...", total=None)
        result = runner.execute(config)
    
    # Display result
    display_single_result(result)
    
    runner.close()
    return result


def execute_test_suite(args: argparse.Namespace, logger: logging.Logger) -> List[RequestResult]:
    """
    Execute a test suite from YAML file.
    
    Args:
        args: Command line arguments
        logger: Logger instance
        
    Returns:
        List of RequestResult objects
    """
    # Load test suite
    suite_path = Path(args.file)
    if not suite_path.exists():
        console.print(f"[bold red]Error:[/bold red] Test suite file not found: {args.file}")
        sys.exit(1)
    
    with open(suite_path, 'r') as f:
        suite = yaml.safe_load(f)
    
    suite_name = suite.get('name', 'Unnamed Test Suite')
    base_url = suite.get('base_url', '')
    defaults = suite.get('defaults', {})
    auth_config = suite.get('auth', {})
    tests = suite.get('tests', [])
    
    console.print(f"\n[bold cyan]Running Test Suite:[/bold cyan] {suite_name}")
    console.print(f"[cyan]Base URL:[/cyan] {base_url}")
    console.print(f"[cyan]Total Tests:[/cyan] {len(tests)}\n")
    
    # Setup authentication
    auth_handler = create_auth_from_config(auth_config)
    
    # Setup retry config
    retry_config = RetryConfig(
        max_retries=defaults.get('retries', 3),
        initial_delay=1.0
    )
    
    # Create runner
    runner = APIRunner(auth_handler, retry_config, logger)
    
    # Execute tests
    results = []
    
    with Progress(console=console) as progress:
        task = progress.add_task("[cyan]Executing tests...", total=len(tests))
        
        for test in tests:
            test_id = test.get('id', 'unknown')
            method = test.get('method', 'GET')
            path = test.get('path', '')
            url = base_url + path if base_url else path
            
            # Merge headers
            headers = defaults.get('headers', {}).copy()
            headers.update(test.get('headers', {}))
            
            # Get body and params
            body = test.get('body')
            params = test.get('params', {})
            timeout = test.get('timeout_seconds', defaults.get('timeout_seconds', 10))
            
            # Create request config
            config = RequestConfig(
                method=method,
                url=url,
                headers=headers,
                params=params,
                body=body,
                timeout=timeout
            )
            
            # Execute
            progress.update(task, description=f"[cyan]Testing: {test_id}...")
            result = runner.execute(config)
            results.append(result)
            
            # Show inline status
            status = "✓" if result.success else "✗"
            color = "green" if result.success else "red"
            console.print(f"  [{color}]{status}[/{color}] {test_id} - {method} {path}")
            
            progress.advance(task)
    
    runner.close()
    
    # Display summary
    display_suite_summary(results, suite_name)
    
    # Generate report
    if not args.no_report:
        console.print("\n[bold cyan]Generating reports...[/bold cyan]")
        report_gen = ReportGenerator()
        report_files = report_gen.generate(results, suite_name, format="both")
        
        console.print("[bold green]✓ Reports generated:[/bold green]")
        for format_type, file_path in report_files.items():
            console.print(f"  • {format_type.upper()}: {file_path}")
    
    return results


def display_single_result(result: RequestResult) -> None:
    """Display single request result in terminal."""
    # Status
    if result.success:
        console.print(f"\n[bold green]✓ Request Successful[/bold green]")
    else:
        console.print(f"\n[bold red]✗ Request Failed[/bold red]")
    
    # Basic info table
    table = Table(show_header=False, box=None)
    table.add_column("Key", style="cyan")
    table.add_column("Value")
    
    table.add_row("Method", result.request_method)
    table.add_row("URL", result.request_url)
    table.add_row("Status Code", str(result.status_code or "N/A"))
    table.add_row("Response Time", format_duration(result.response_time))
    table.add_row("Response Size", format_bytes(result.response_size))
    
    if result.retry_count > 0:
        table.add_row("Retries", str(result.retry_count))
    
    console.print(table)
    
    # Diagnosis for failures
    if not result.success:
        diagnosis = DiagnosisEngine.diagnose(result)
        
        diagnosis_text = f"""[bold]Issue:[/bold] {diagnosis.issue}
[bold]Cause:[/bold] {diagnosis.cause}
[bold]Suggestion:[/bold] {diagnosis.suggestion}
[bold]Category:[/bold] {diagnosis.category}"""
        
        console.print(Panel(
            diagnosis_text,
            title="🔍 Diagnosis",
            border_style="yellow" if diagnosis.severity in ["medium", "high"] else "red"
        ))
    
    # Response body (truncated)
    if result.response_body:
        body_preview = result.response_body[:500]
        if len(result.response_body) > 500:
            body_preview += "\n... (truncated)"
        
        console.print(Panel(
            body_preview,
            title="Response Body",
            border_style="blue"
        ))


def display_suite_summary(results: List[RequestResult], suite_name: str) -> None:
    """Display test suite summary."""
    summary = DiagnosisEngine.get_summary(results)
    
    console.print(f"\n[bold]Test Suite Summary: {suite_name}[/bold]\n")
    
    # Summary table
    table = Table(show_header=True)
    table.add_column("Metric", style="cyan")
    table.add_column("Value", justify="right")
    
    table.add_row("Total Requests", str(summary['total_requests']))
    table.add_row("Successful", f"[green]{summary['successful']}[/green]")
    table.add_row("Failed", f"[red]{summary['failed']}[/red]")
    table.add_row("Success Rate", f"{summary['success_rate']:.1f}%")
    table.add_row("Avg Response Time", format_duration(summary['avg_response_time']))
    
    console.print(table)
    
    # Failed tests details
    if summary['failed'] > 0:
        console.print("\n[bold yellow]Failed Tests:[/bold yellow]")
        
        for result in results:
            if not result.success:
                diagnosis = DiagnosisEngine.diagnose(result)
                console.print(f"  [red]✗[/red] {result.request_method} {result.request_url}")
                console.print(f"    → {diagnosis.issue}: {diagnosis.cause}")


def main():
    """Main entry point."""
    # Load environment variables
    load_env()
    
    # Create parser
    parser = argparse.ArgumentParser(
        description="API Debugging & Monitoring Toolkit",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    
    # Single request command
    request_parser = subparsers.add_parser('request', help='Execute a single API request')
    request_parser.add_argument('--method', required=True, choices=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                               help='HTTP method')
    request_parser.add_argument('--url', required=True, help='Request URL')
    request_parser.add_argument('--headers', help='Request headers as JSON string')
    request_parser.add_argument('--params', help='Query parameters as JSON string')
    request_parser.add_argument('--body', help='Request body as JSON string')
    request_parser.add_argument('--bearer', help='Bearer token for authentication')
    request_parser.add_argument('--api-key', help='API key for authentication')
    request_parser.add_argument('--api-key-header', default='X-API-Key', help='Header name for API key')
    request_parser.add_argument('--timeout', type=int, default=10, help='Request timeout in seconds')
    request_parser.add_argument('--retries', type=int, default=3, help='Max retry attempts')
    request_parser.add_argument('--verbose', action='store_true', help='Enable verbose logging')
    
    # Test suite command
    suite_parser = subparsers.add_parser('suite', help='Execute a test suite from YAML file')
    suite_parser.add_argument('--file', required=True, help='Path to test suite YAML file')
    suite_parser.add_argument('--no-report', action='store_true', help='Skip report generation')
    suite_parser.add_argument('--verbose', action='store_true', help='Enable verbose logging')
    
    # Parse arguments
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Setup logging
    logger = setup_logging(args.verbose)
    
    # Execute command
    try:
        if args.command == 'request':
            execute_single_request(args, logger)
        elif args.command == 'suite':
            execute_test_suite(args, logger)
    
    except KeyboardInterrupt:
        console.print("\n[yellow]Operation cancelled by user[/yellow]")
        sys.exit(0)
    
    except Exception as e:
        console.print(f"\n[bold red]Error:[/bold red] {str(e)}")
        logger.exception("Unexpected error occurred")
        sys.exit(1)


if __name__ == "__main__":
    main()
