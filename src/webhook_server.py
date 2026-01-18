"""
Webhook receiver server.
Local server to receive and log webhook payloads for testing.
Optimized for production deployment on Render.
"""
import json
import os
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from rich.console import Console
from rich.panel import Panel
from rich.json import JSON
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Ensure logs directory exists
Path("logs/webhooks").mkdir(parents=True, exist_ok=True)

# Initialize FastAPI app
app = FastAPI(
    title="API-Watch Webhook Receiver",
    description="Production webhook receiver for API integration testing",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    """Root endpoint with service information."""
    return {
        "service": "API-Watch Webhook Receiver",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "webhook": "/webhook (or any path)",
            "docs": "/docs",
            "redoc": "/redoc"
        },
        "message": "Send webhooks to any path, e.g., POST /webhook"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint for Render monitoring.
    Returns 200 OK if service is healthy.
    """
    try:
        # Verify logs directory is accessible
        logs_dir = Path("logs/webhooks")
        if not logs_d with webhook details
    """
    try:
        # Get request details
        method = request.method
        headers = dict(request.headers)
        
        # Try to parse body as JSON
        body: Optional[Any] = None
        try:
            body = await request.json()
        except Exception:
            # If not JSON, try to get raw body
            try:
                raw_body = await request.body()
                body = raw_body.decode('utf-8') if raw_body else None
            except Exception as e:
                logger.warning(f"Failed to parse request body: {str(e)}")
                body = None
        
        # Log webhook
        log_file = log_webhook(f"/{full_path}", method, headers, body)
        logger.info(f"Webhook received: {method} /{full_path}")
        
        # Display in terminal (only if running locally with console)
        try:
            display_webhook(f"/{full_path}", method, headers, body)
        except Exception as e:
            # Silently fail display errors in production
            logger.debug(f"Display webhook failed: {str(e)}")
        
        # Return success response
        return JSONResponse(
            status_code=200,
            content={
                "status": "received",
                "message": "Webhook received and logged successfully",
                "log_file": log_file,
                "timestamp": datetime.now().isoformat(),
                "method": method,
                "path": f"/{full_path}"
            }
        )
    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "Failed to process webhook",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            body = await request.json()
    except Exception:
        # If not JSON, try to get raw body
        try:
            raw_body = await request.body()
            body = raw_body.decode('utf-8') if raw_body else None
        except Exception:
       
    Main entry point for webhook server.
    Optimized for both local development and Render deployment.
    """
    parser = argparse.ArgumentParser(description="API-Watch Webhook Receiver Server")
    parser.add_argument(
        '--host',
        default=os.getenv('HOST', '0.0.0.0'),
        help='Host to bind (default: 0.0.0.0, required for Render)'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=int(os.getenv('PORT', '8080')),
        help='Port to bind (default: 8080, Render uses PORT env var)'
    )
    parser.add_argument(
        '--reload',
        action='store_true',
        help='Enable auto-reload (development only)'
    )
    
    args = parser.parse_args()
    
    # Log startup information
    logger.info(f"Starting API-Watch Webhook Receiver on {args.host}:{args.port}")
    
    # Display startup banner (only if console is available)
    try:
        console.print(Panel.fit(
            f"""[bold cyan]API-Watch Webhook Receiver[/bold cyan]
            
[green]✓[/green] Server starting on [bold]http://{args.host}:{args.port}[/bold]
[green]✓[/green] Webhooks will be logged to [bold]logs/webhooks/[/bold]
[green]✓[/green] Health check available at [bold]http://{args.host}:{args.port}/health[/bold]
[green]✓[/green] API docs available at [bold]http://{args.host}:{args.port}/docs[/bold]

Press [bold red]Ctrl+C[/bold red] to stop the server""",
            border_style="cyan"
        ))
        console.print("\n[dim]Waiting for webhooks...[/dim]\n")
    except Exception:
        # If console fails (e.g., in production), just log
        logger.info("Webhook receiver ready to accept requests")
    
    try:
        uvicorn.run(
            "webhook_server:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            log_level="info",
            access_log=True
        )
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
        try:
            console.print("\n[yellow]Server stopped by user[/yellow]")
        except Exception:
            pass
        
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
