"""
Activity log routes — workspace-level mutation history.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..jwt_auth import get_current_user
from ..models import ActivityLog, User
from ..rbac import get_workspace_id

# In-memory cache of user emails to avoid repeated lookups
_user_email_cache: dict[str, str] = {}

router = APIRouter(prefix="/activity", tags=["Activity"])


@router.get("")
async def list_activity(
    resource_type: str | None = Query(None, description="Filter by resource type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List activity log entries for the current workspace.
    If no workspace header, shows personal activity only."""
    query = select(ActivityLog)

    if workspace_id:
        query = query.where(ActivityLog.workspace_id == workspace_id)
    else:
        query = query.where(ActivityLog.user_id == user.id)

    if resource_type:
        query = query.where(ActivityLog.resource_type == resource_type)

    query = query.order_by(desc(ActivityLog.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    # Resolve user emails
    user_ids = {log.user_id for log in logs}
    email_map: dict[str, str] = {}
    for uid in user_ids:
        if uid in _user_email_cache:
            email_map[uid] = _user_email_cache[uid]
        else:
            u_result = await db.execute(select(User).where(User.id == uid))
            u = u_result.scalar_one_or_none()
            email = u.email if u else "unknown"
            _user_email_cache[uid] = email
            email_map[uid] = email

    return [
        {
            "id": log.id,
            "action": log.action.value,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "resource_name": log.resource_name,
            "user_id": log.user_id,
            "user_email": email_map.get(log.user_id, "unknown"),
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
