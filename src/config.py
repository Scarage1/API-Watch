"""
Centralized configuration for API-Watch.

All settings are loaded from environment variables with sensible defaults.
Pydantic BaseSettings gives us:
  - Automatic env var reading (case-insensitive)
  - Type coercion & validation
  - .env file support
  - A single source of truth for every tunable knob
"""
from __future__ import annotations

import logging
import os
import secrets
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings — populated from environment variables."""

    # ── General ──────────────────────────────────────────────────────
    app_name: str = "API-Watch"
    app_version: str = "2.1.0"
    debug: bool = False
    testing: bool = False
    log_level: str = "INFO"

    # ── Server ───────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    cors_allowed_origins: str = "http://localhost:5173,http://localhost:8000"

    # ── Database ─────────────────────────────────────────────────────
    database_url: str = ""  # computed in validator if empty
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_timeout: int = 30
    db_echo: bool = False

    # ── Redis / Cache ────────────────────────────────────────────────
    redis_url: str = ""  # empty → in-memory fallback
    redis_prefix: str = "apiwatch:"
    redis_default_ttl: int = 300  # 5 minutes

    # ── JWT / Auth ───────────────────────────────────────────────────
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # ── Rate Limiting ────────────────────────────────────────────────
    rate_limit_enabled: bool = True
    rate_limit_default: int = 60
    rate_limit_auth: int = 10
    rate_limit_window: int = 60

    # ── Request Execution ────────────────────────────────────────────
    max_request_body_size: int = 10 * 1024 * 1024  # 10 MB

    # ── Storage ──────────────────────────────────────────────────────
    storage_backend: str = "filesystem"  # "filesystem" | "azure_blob"
    storage_root: str = "data/storage"
    azure_blob_connection_string: str = ""
    azure_blob_container: str = "apiwatch"

    # ── Webhook ──────────────────────────────────────────────────────
    webhook_log_dir: str = "logs/webhooks"

    # ── Validators ───────────────────────────────────────────────────

    @field_validator("database_url", mode="before")
    @classmethod
    def _default_database_url(cls, v: str) -> str:
        if v:
            return v
        # Default to SQLite in ./data (works in Docker WORKDIR /app and local dev)
        db_dir = Path("data")
        try:
            db_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.warning("Cannot create DB directory %s: %s — using /tmp", db_dir, e)
            db_dir = Path("/tmp/apiwatch-data")
            db_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{db_dir.resolve()}/apiwatch.db"

    @field_validator("jwt_secret_key", mode="before")
    @classmethod
    def _require_jwt_secret(cls, v: str) -> str:
        if v:
            return v
        # Allow empty only when TESTING or local development
        if os.getenv("TESTING", "").lower() in ("true", "1"):
            return "test-only-insecure-key"
        if os.getenv("ENVIRONMENT", "development").lower() in ("development", "dev", "local"):
            generated = secrets.token_hex(32)
            logger.warning(
                "⚠️  JWT_SECRET_KEY not set — auto-generated an ephemeral key. "
                "Sessions will NOT survive restarts."
            )
            return generated
        # In production, refuse to start without a proper secret
        raise ValueError(
            "JWT_SECRET_KEY must be set in production. "
            "Generate one with: openssl rand -hex 32"
        )

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _clean_origins(cls, v: str) -> str:
        # Accept comma-separated string, strip whitespace
        if isinstance(v, str):
            return ",".join(o.strip() for o in v.split(",") if o.strip())
        return v

    # ── Computed helpers ─────────────────────────────────────────────

    @property
    def cors_origins_list(self) -> List[str]:
        """Return CORS origins as a list."""
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def is_postgres(self) -> bool:
        return "postgresql" in self.database_url

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.database_url

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    """Return cached application settings (singleton)."""
    return Settings()
