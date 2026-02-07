"""
Monitor CRUD routes — create, list, update, delete monitors,
view run history, and trigger manual execution.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import (
    User, Monitor, MonitorRun, MonitorStatus, Collection,
    MonitorNotification, NotificationChannel,
    ActivityLog, ActivityAction, _utcnow,
)
from ..jwt_auth import get_current_user_or_apikey as get_current_user
from ..rbac import get_workspace_id

router = APIRouter(prefix="/monitors", tags=["Monitoring"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class MonitorCreate(BaseModel):
    name: str
    description: Optional[str] = None
    collection_id: str
    cron_expression: str = "*/5 * * * *"
    enabled: bool = True
    assertions: List[dict] = []
    alert_after_failures: int = 1
    channel_ids: List[str] = []


class MonitorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None
    assertions: Optional[List[dict]] = None
    alert_after_failures: Optional[int] = None
    channel_ids: Optional[List[str]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_next_run(cron_expr: str) -> Optional[str]:
    """Compute next run time from cron expression. Returns ISO string or None."""
    try:
        from croniter import croniter
        cron = croniter(cron_expr, _utcnow())
        return cron.get_next().isoformat() if hasattr(cron.get_next(), 'isoformat') else None
    except Exception:
        return None


def _monitor_to_dict(m: Monitor) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "collection_id": m.collection_id,
        "cron_expression": m.cron_expression,
        "enabled": m.enabled,
        "assertions": m.assertions or [],
        "alert_after_failures": m.alert_after_failures,
        "consecutive_failures": m.consecutive_failures,
        "last_status": m.last_status.value if m.last_status else None,
        "last_run_at": m.last_run_at.isoformat() if m.last_run_at else None,
        "next_run_at": m.next_run_at.isoformat() if m.next_run_at else None,
        "channel_ids": [link.channel_id for link in (m.notification_links or [])],
        "created_at": m.created_at.isoformat(),
        "updated_at": m.updated_at.isoformat(),
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_monitor(
    body: MonitorCreate,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new monitor."""
    # Verify collection exists
    col_q = select(Collection).where(Collection.id == body.collection_id)
    if workspace_id:
        col_q = col_q.where(Collection.workspace_id == workspace_id)
    else:
        col_q = col_q.where(Collection.owner_id == user.id)
    result = await db.execute(col_q)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Collection not found")

    monitor = Monitor(
        name=body.name,
        description=body.description,
        collection_id=body.collection_id,
        cron_expression=body.cron_expression,
        enabled=body.enabled,
        assertions=body.assertions,
        alert_after_failures=body.alert_after_failures,
        owner_id=user.id,
        workspace_id=workspace_id,
    )

    # Compute next run
    try:
        from croniter import croniter
        cron = croniter(body.cron_expression, _utcnow())
        monitor.next_run_at = cron.get_next(ret_type=float)
        from datetime import datetime, timezone
        monitor.next_run_at = datetime.fromtimestamp(monitor.next_run_at, tz=timezone.utc)
    except Exception:
        pass

    db.add(monitor)
    await db.flush()

    # Link notification channels
    for ch_id in body.channel_ids:
        link = MonitorNotification(monitor_id=monitor.id, channel_id=ch_id)
        db.add(link)

    # Activity log
    log = ActivityLog(
        workspace_id=workspace_id, user_id=user.id,
        action=ActivityAction.CREATED, resource_type="monitor",
        resource_id=monitor.id, resource_name=body.name,
    )
    db.add(log)

    await db.commit()
    await db.refresh(monitor, ["notification_links"])

    return _monitor_to_dict(monitor)


@router.get("")
async def list_monitors(
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List monitors for the current workspace."""
    query = select(Monitor).options(selectinload(Monitor.notification_links))
    if workspace_id:
        query = query.where(Monitor.workspace_id == workspace_id)
    else:
        query = query.where(Monitor.owner_id == user.id)
    query = query.order_by(Monitor.created_at.desc())
    result = await db.execute(query)
    monitors = result.scalars().all()
    return [_monitor_to_dict(m) for m in monitors]


@router.get("/{monitor_id}")
async def get_monitor(
    monitor_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a single monitor with details."""
    query = (
        select(Monitor)
        .where(Monitor.id == monitor_id)
        .options(selectinload(Monitor.notification_links))
    )
    if workspace_id:
        query = query.where(Monitor.workspace_id == workspace_id)
    else:
        query = query.where(Monitor.owner_id == user.id)
    result = await db.execute(query)
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return _monitor_to_dict(monitor)


@router.put("/{monitor_id}")
async def update_monitor(
    monitor_id: str,
    body: MonitorUpdate,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Update a monitor."""
    query = (
        select(Monitor)
        .where(Monitor.id == monitor_id)
        .options(selectinload(Monitor.notification_links))
    )
    if workspace_id:
        query = query.where(Monitor.workspace_id == workspace_id)
    else:
        query = query.where(Monitor.owner_id == user.id)
    result = await db.execute(query)
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    update_data = body.model_dump(exclude_unset=True)

    # Handle channel_ids separately
    channel_ids = update_data.pop("channel_ids", None)
    if channel_ids is not None:
        # Remove old links
        for link in list(monitor.notification_links):
            await db.delete(link)
        # Add new
        for ch_id in channel_ids:
            db.add(MonitorNotification(monitor_id=monitor.id, channel_id=ch_id))

    for key, value in update_data.items():
        setattr(monitor, key, value)

    # Recompute next_run_at if cron changed
    if "cron_expression" in update_data:
        try:
            from croniter import croniter
            from datetime import datetime, timezone
            cron = croniter(monitor.cron_expression, _utcnow())
            monitor.next_run_at = datetime.fromtimestamp(cron.get_next(ret_type=float), tz=timezone.utc)
        except Exception:
            pass

    await db.commit()
    await db.refresh(monitor, ["notification_links"])
    return _monitor_to_dict(monitor)


@router.delete("/{monitor_id}", status_code=204)
async def delete_monitor(
    monitor_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a monitor and all its runs."""
    query = select(Monitor).where(Monitor.id == monitor_id)
    if workspace_id:
        query = query.where(Monitor.workspace_id == workspace_id)
    else:
        query = query.where(Monitor.owner_id == user.id)
    result = await db.execute(query)
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    log = ActivityLog(
        workspace_id=workspace_id, user_id=user.id,
        action=ActivityAction.DELETED, resource_type="monitor",
        resource_id=monitor.id, resource_name=monitor.name,
    )
    db.add(log)

    await db.delete(monitor)
    await db.commit()


# ── Run History ───────────────────────────────────────────────────────────────

@router.get("/{monitor_id}/runs")
async def list_monitor_runs(
    monitor_id: str,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List runs for a monitor, newest first."""
    # Verify access
    query = select(Monitor).where(Monitor.id == monitor_id)
    if workspace_id:
        query = query.where(Monitor.workspace_id == workspace_id)
    else:
        query = query.where(Monitor.owner_id == user.id)
    result = await db.execute(query)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Monitor not found")

    runs_q = (
        select(MonitorRun)
        .where(MonitorRun.monitor_id == monitor_id)
        .order_by(desc(MonitorRun.started_at))
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(runs_q)
    runs = result.scalars().all()

    return [
        {
            "id": r.id,
            "status": r.status.value,
            "duration_ms": r.duration_ms,
            "total_requests": r.total_requests,
            "passed_requests": r.passed_requests,
            "failed_requests": r.failed_requests,
            "assertions_passed": r.assertions_passed,
            "assertions_failed": r.assertions_failed,
            "error": r.error,
            "started_at": r.started_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@router.get("/{monitor_id}/runs/{run_id}")
async def get_monitor_run(
    monitor_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed run results."""
    query = select(Monitor).where(Monitor.id == monitor_id)
    if workspace_id:
        query = query.where(Monitor.workspace_id == workspace_id)
    else:
        query = query.where(Monitor.owner_id == user.id)
    result = await db.execute(query)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Monitor not found")

    run_q = select(MonitorRun).where(
        MonitorRun.id == run_id, MonitorRun.monitor_id == monitor_id
    )
    result = await db.execute(run_q)
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return {
        "id": run.id,
        "monitor_id": run.monitor_id,
        "status": run.status.value,
        "duration_ms": run.duration_ms,
        "total_requests": run.total_requests,
        "passed_requests": run.passed_requests,
        "failed_requests": run.failed_requests,
        "assertions_passed": run.assertions_passed,
        "assertions_failed": run.assertions_failed,
        "results": run.results or [],
        "error": run.error,
        "started_at": run.started_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }


# ── Manual Trigger ────────────────────────────────────────────────────────────

@router.post("/{monitor_id}/trigger", status_code=202)
async def trigger_monitor(
    monitor_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger a monitor run. Runs in the background."""
    query = select(Monitor).where(Monitor.id == monitor_id)
    if workspace_id:
        query = query.where(Monitor.workspace_id == workspace_id)
    else:
        query = query.where(Monitor.owner_id == user.id)
    result = await db.execute(query)
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    from ..monitor_executor import execute_monitor
    background_tasks.add_task(execute_monitor, monitor_id)

    return {"detail": "Monitor execution triggered", "monitor_id": monitor_id}
