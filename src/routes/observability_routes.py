"""
Observability routes — metrics, traces, and usage analytics.
Exposes telemetry data captured by the request middleware.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, desc, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, RequestHistory
from ..jwt_auth import get_current_user
from ..telemetry import get_metrics, get_traces

router = APIRouter(prefix="/observability", tags=["Observability"])


# ── Telemetry endpoints ──────────────────────────────────────────────────────

@router.get("/metrics")
async def metrics_summary(user: User = Depends(get_current_user)):
    """Return aggregated server metrics (requests, latency, error rate)."""
    return get_metrics().get_summary()


@router.get("/traces")
async def list_traces(
    path: Optional[str] = Query(None, description="Filter by URL path prefix"),
    min_duration_ms: Optional[float] = Query(None, description="Min duration in ms"),
    status_code: Optional[int] = Query(None, description="Filter by HTTP status code"),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
):
    """Return recent request traces with optional filters."""
    spans = get_traces().search(
        path=path,
        min_duration_ms=min_duration_ms,
        status_code=status_code,
        limit=limit,
    )
    return {"traces": [s.to_dict() for s in spans], "total_stored": get_traces().count}


# ── Usage analytics (DB-backed) ──────────────────────────────────────────────

@router.get("/usage")
async def usage_analytics(
    days: int = Query(7, ge=1, le=90, description="Number of days to aggregate"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Usage analytics for the platform.
    Returns: total requests, success/failure counts, requests per day,
    top methods, average response time.
    """
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Total requests in period
    total_q = (
        select(func.count())
        .select_from(RequestHistory)
        .where(RequestHistory.executed_at >= cutoff)
    )
    total = (await db.execute(total_q)).scalar() or 0

    # Success vs failure
    success_q = (
        select(func.count())
        .select_from(RequestHistory)
        .where(RequestHistory.executed_at >= cutoff)
        .where(RequestHistory.status_code.between(200, 399))
    )
    success = (await db.execute(success_q)).scalar() or 0

    # Method breakdown
    method_q = (
        select(RequestHistory.method, func.count())
        .where(RequestHistory.executed_at >= cutoff)
        .group_by(RequestHistory.method)
    )
    method_result = await db.execute(method_q)
    by_method = {row[0]: row[1] for row in method_result.all()}

    # Average response time
    avg_q = (
        select(func.avg(RequestHistory.response_time))
        .where(RequestHistory.executed_at >= cutoff)
    )
    avg_time = (await db.execute(avg_q)).scalar()
    avg_time_ms = round(avg_time * 1000, 1) if avg_time else 0

    # Requests per day (last N days)
    daily_q = (
        select(
            cast(RequestHistory.executed_at, Date).label("day"),
            func.count().label("count"),
        )
        .where(RequestHistory.executed_at >= cutoff)
        .group_by("day")
        .order_by("day")
    )
    daily_result = await db.execute(daily_q)
    per_day = [
        {"date": str(row[0]), "count": row[1]}
        for row in daily_result.all()
    ]

    return {
        "period_days": days,
        "total_requests": total,
        "successful": success,
        "failed": total - success,
        "success_rate": round(success / total * 100, 1) if total else 0,
        "avg_response_time_ms": avg_time_ms,
        "by_method": by_method,
        "per_day": per_day,
    }
