"""
Structured logging configuration for API-Watch.
Uses structlog for JSON-formatted, correlation-ID-aware logging
in production, and human-readable colored output in development.
"""
import logging
import os
import sys
import uuid
from contextvars import ContextVar
from typing import Optional

import structlog

# Context variable for request correlation IDs
correlation_id: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)


def get_correlation_id() -> str:
    """Get or create a correlation ID for the current request."""
    cid = correlation_id.get()
    if cid is None:
        cid = uuid.uuid4().hex[:12]
        correlation_id.set(cid)
    return cid


def add_correlation_id(
    logger: logging.Logger, method_name: str, event_dict: dict
) -> dict:
    """Structlog processor: inject correlation ID into every log entry."""
    cid = correlation_id.get()
    if cid:
        event_dict["correlation_id"] = cid
    return event_dict


def add_app_context(
    logger: logging.Logger, method_name: str, event_dict: dict
) -> dict:
    """Structlog processor: add app-level context to log entries."""
    event_dict["service"] = "api-watch"
    return event_dict


def configure_logging(environment: str = "production", log_level: str = "INFO") -> None:
    """
    Configure structlog and stdlib logging.

    In development: colored, human-readable console output.
    In production: JSON-formatted output for log aggregation.

    Args:
        environment: 'development' or 'production'
        log_level: Python log level string (DEBUG, INFO, WARNING, ERROR)
    """
    is_dev = environment.lower() in ("development", "dev", "local")

    # Shared processors for all environments
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        add_correlation_id,
        add_app_context,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if is_dev:
        # Development: colored console output
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stderr.isatty())
    else:
        # Production: JSON output for log aggregation (ELK, Datadog, etc.)
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Configure stdlib logging to use structlog formatting
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Silence noisy third-party loggers
    for noisy_logger in ("uvicorn.access", "httpx", "httpcore", "asyncio"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """Get a structlog logger instance."""
    return structlog.get_logger(name)
