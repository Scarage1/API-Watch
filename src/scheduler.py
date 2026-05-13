"""
Background scheduler for API monitors.

Runs as an asyncio background task during the FastAPI lifespan.
Checks for monitors that are due for execution and dispatches them.
"""

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from .database import _get_session_factory
from .models import Monitor

logger = logging.getLogger(__name__)

# Global flag to stop the scheduler
_running = False
_task = None


async def start_scheduler(interval_seconds: int = 30) -> None:
    """Start the background scheduler loop."""
    global _running, _task
    _running = True
    _task = asyncio.current_task()
    logger.info("Monitor scheduler started (interval=%ds)", interval_seconds)

    while _running:
        try:
            await _check_and_run_due_monitors()
        except Exception as e:
            logger.exception(f"Scheduler tick error: {e}")

        await asyncio.sleep(interval_seconds)


async def stop_scheduler() -> None:
    """Stop the background scheduler."""
    global _running
    _running = False
    logger.info("Monitor scheduler stopped")


async def _check_and_run_due_monitors() -> None:
    """Find monitors that are due and execute them."""
    from .monitor_executor import execute_monitor

    session_factory = _get_session_factory()
    async with session_factory() as db:
        now = datetime.now(UTC)

        # Find enabled monitors whose next_run_at is in the past
        result = await db.execute(
            select(Monitor.id)
            .where(
                Monitor.enabled,
                Monitor.next_run_at is not None,
                Monitor.next_run_at <= now,
            )
            .limit(20)  # Process max 20 per tick to avoid overload
        )
        due_ids = [row[0] for row in result.fetchall()]

    if not due_ids:
        return

    logger.info(f"Executing {len(due_ids)} due monitor(s)")

    # Execute monitors concurrently (with a semaphore to limit parallelism)
    sem = asyncio.Semaphore(5)

    async def _run_with_semaphore(monitor_id: str) -> None:
        async with sem:
            try:
                await execute_monitor(monitor_id)
            except Exception as e:
                logger.error(f"Monitor {monitor_id} execution error: {e}")

    await asyncio.gather(*[_run_with_semaphore(mid) for mid in due_ids])
