"""
Database configuration and session management.

Supports both PostgreSQL (asyncpg) for production and SQLite (aiosqlite)
for development/testing.  All settings come from ``src.config.Settings``.
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool, StaticPool

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


# ── Engine & session (module-level singletons, created lazily) ───────

engine: AsyncEngine | None = None
async_session: async_sessionmaker[AsyncSession] | None = None


def _build_engine() -> AsyncEngine:
    """Create the async engine using current settings."""
    from .config import get_settings

    settings = get_settings()
    url = settings.database_url
    is_sqlite = settings.is_sqlite

    connect_args = {}
    pool_class = AsyncAdaptedQueuePool

    if is_sqlite:
        connect_args["check_same_thread"] = False
        if url == "sqlite+aiosqlite://" or ":memory:" in url:
            # In-memory SQLite must share a single connection (StaticPool)
            pool_class = StaticPool
        else:
            pool_class = NullPool

    kwargs: dict = dict(
        echo=settings.db_echo,
        connect_args=connect_args,
        poolclass=pool_class,
    )

    if not is_sqlite:
        kwargs.update(
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            pool_pre_ping=True,  # verify connections before checkout
        )

    logger.info(
        "Database: %s engine (%s)",
        "SQLite" if is_sqlite else "PostgreSQL",
        url.split("@")[-1] if "@" in url else url.split("///")[-1],
    )
    return create_async_engine(url, **kwargs)


def _get_engine() -> AsyncEngine:
    global engine
    if engine is None:
        engine = _build_engine()
    return engine


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    global async_session
    if async_session is None:
        async_session = async_sessionmaker(
            _get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return async_session


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a database session."""
    session_factory = _get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Create all database tables (used when Alembic is not in charge)."""
    eng = _get_engine()
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Dispose of the engine connection pool."""
    global engine, async_session
    if engine is not None:
        await engine.dispose()
        engine = None
        async_session = None


async def check_db_health() -> bool:
    """Return True if the DB is reachable."""
    try:
        from sqlalchemy import text
        eng = _get_engine()
        async with eng.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
