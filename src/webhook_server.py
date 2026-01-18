"""
Webhook receiver server.
Local server to receive and log webhook payloads for testing.
"""
import json
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
import uvicorn
from rich.console import Console
from rich.panel import Panel
from rich.json import JSON

# Ensure logs directory exists
Path("logs/webhooks").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Webhook Receiver", version="1.0.0")
console = Console()


def log_webhook(endpoint: str, method: str, headers: Dict, body: Any) -> str:
    """
    Log webhook payload to file.
    
    Args:
        endpoint: Webhook endpoint path
        method: HTTP method
        headers: Request headers
        body: Request body
        
    Returns:
        Path to log file
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_dir = Path("logs/webhooks")
    log_file = log_dir / f"webhook_{timestamp}.json"
    
    log_data = {
        "timestamp": datetime.now().isoformat(),
        "endpoint": endpoint,
        "method": method,
        "headers": dict(headers),
        "body": body
    }
    
    with open(log_file, 'w') as f:
        json.dump(log_data, f, indent=2, default=str)
    
    return str(log_file)


def display_webhook(endpoint: str, method: str, headers: Dict, body: Any) -> None:
    """
    Display webhook details in terminal.
    
    Args:
        endpoint: Webhook endpoint path
        method: HTTP method
        headers: Request headers
        body: Request body
    """
    console.print(f"\n[bold cyan]🔔 Webhook Received[/bold cyan]")
    console.print(f"[cyan]Time:[/cyan] {datetime.now().isoformat()}")
    console.print(f"[cyan]Method:[/cyan] {method}")
    console.print(f"[cyan]Endpoint:[/cyan] {endpoint}")
    
    # Display headers
    console.print("\n[bold]Headers:[/bold]")
    headers_filtered = {k: v for k, v in headers.items() if not k.lower().startswith('x-forwarded')}
    console.print(JSON(json.dumps(headers_filtered, indent=2)))
    
    # Display body
    console.print("\n[bold]Body:[/bold]")
    if body:
        console.print(Panel(
            JSON(json.dumps(body, indent=2, default=str)),
            border_style="green"
        ))
    else:
        console.print("[dim]No body[/dim]")
    
    console.print("\n" + "="*80 + "\n")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Webhook Receiver",
        "status": "running",
        "message": "Send webhooks to any path, e.g., POST /webhook"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def catch_all(request: Request, full_path: str):
    """
    Catch-all endpoint to receive webhooks at any path.
    
    Args:
        request: FastAPI request object
        full_path: Full request path
        
    Returns:
        JSON response
    """
    # Get request details
    method = request.method
    headers = dict(request.headers)
    
    # Try to parse body as JSON
    try:
        body = await request.json()
    except Exception:
        # If not JSON, try to get raw body
        try:
            raw_body = await request.body()
            body = raw_body.decode('utf-8') if raw_body else None
        except Exception:
            body = None
    
    # Log webhook
    log_file = log_webhook(f"/{full_path}", method, headers, body)
    
    # Display in terminal
    display_webhook(f"/{full_path}", method, headers, body)
    
    # Return success response
    return JSONResponse(
        status_code=200,
        content={
            "status": "received",
            "message": "Webhook received and logged successfully",
            "log_file": log_file,
            "timestamp": datetime.now().isoformat()
        }
    )


def main():
    """Main entry point for webhook server."""
    parser = argparse.ArgumentParser(description="Webhook Receiver Server")
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=8080, help='Port to bind (default: 8080)')
    parser.add_argument('--reload', action='store_true', help='Enable auto-reload')
    
    args = parser.parse_args()
    
    console.print(Panel.fit(
        f"""[bold cyan]Webhook Receiver Server[/bold cyan]
        
[green]✓[/green] Server starting on [bold]http://{args.host}:{args.port}[/bold]
[green]✓[/green] Webhooks will be logged to [bold]logs/webhooks/[/bold]
[green]✓[/green] Send webhooks to any endpoint, e.g., [bold]POST http://localhost:{args.port}/webhook[/bold]

Press [bold red]Ctrl+C[/bold red] to stop the server""",
        border_style="cyan"
    ))
    
    console.print("\n[dim]Waiting for webhooks...[/dim]\n")
    
    try:
        uvicorn.run(
            "webhook_server:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            log_level="warning"  # Suppress uvicorn logs
        )
    except KeyboardInterrupt:
        console.print("\n[yellow]Server stopped by user[/yellow]")


if __name__ == "__main__":
    main()
