"""
Request History routes — list, search, clear.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, RequestHistory
from ..jwt_auth import get_current_user

router = APIRouter(prefix="/history", tags=["History"])


@router.get("")
async def list_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    method: Optional[str] = Query(None),
    status_code: Optional[int] = Query(None),
    success: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
):
    """List request history with filters."""
    query = select(RequestHistory).where(RequestHistory.owner_id == user.id)

    if method:
        query = query.where(RequestHistory.request_method == method.upper())
    if status_code is not None:
        query = query.where(RequestHistory.status_code == status_code)
    if success is not None:
        query = query.where(RequestHistory.success == success)
    if search:
        query = query.where(RequestHistory.request_url.ilike(f"%{search}%"))

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # Get paginated results
    query = query.order_by(RequestHistory.timestamp.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": h.id,
                "request_method": h.request_method,
                "request_url": h.request_url,
                "success": h.success,
                "status_code": h.status_code,
                "response_time": h.response_time,
                "response_size": h.response_size,
                "error": h.error,
                "error_type": h.error_type,
                "retry_count": h.retry_count,
                "timestamp": h.timestamp.isoformat(),
            }
            for h in items
        ],
    }


@router.get("/stats")
async def get_history_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate statistics from request history."""
    owner_filter = RequestHistory.owner_id == user.id

    result = (
        await db.execute(
            select(
                func.count().label("total"),
                func.count()
                .filter(RequestHistory.success == True)
                .label("successful"),
                func.avg(RequestHistory.response_time).label("avg_time"),
            ).where(owner_filter)
        )
    ).one()

    total = result.total or 0
    successful = result.successful or 0

    return {
        "total_requests": total,
        "successful": successful,
        "failed": total - successful,
        "success_rate": round((successful / total) * 100, 1) if total else 0,
        "avg_response_time": round(result.avg_time or 0, 3),
    }


@router.get("/{history_id}")
async def get_history_detail(
    history_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full details of a history entry including response body."""
    result = await db.execute(
        select(RequestHistory).where(
            RequestHistory.id == history_id, RequestHistory.owner_id == user.id
        )
    )
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="History entry not found")

    return {
        "id": h.id,
        "request_method": h.request_method,
        "request_url": h.request_url,
        "request_headers": h.request_headers,
        "request_body": h.request_body,
        "success": h.success,
        "status_code": h.status_code,
        "response_time": h.response_time,
        "response_size": h.response_size,
        "response_body": h.response_body,
        "response_headers": h.response_headers,
        "error": h.error,
        "error_type": h.error_type,
        "retry_count": h.retry_count,
        "timestamp": h.timestamp.isoformat(),
    }


@router.delete("", status_code=204)
async def clear_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear all request history for the current user."""
    await db.execute(
        delete(RequestHistory).where(RequestHistory.owner_id == user.id)
    )
    await db.commit()
