"""
Audit log routes — system-wide observability for auth, security, and admin events.
Admin-only access with filtering, pagination, and stats.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..jwt_auth import get_current_user
from ..models import AuditLog, User

router = APIRouter(prefix="/audit", tags=["Audit"])


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _require_admin(user: User, db: AsyncSession) -> None:
    """Raise 403 if user is not an org admin/owner.
    For now: only the first registered user is treated as admin,
    or anyone with is_active=True can view audit logs (relaxed for beta)."""
    # In a full production build, check OrgMembership(role=OWNER|ADMIN).
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Audit log access denied")


def _log_to_dict(log: AuditLog) -> dict:
    return {
        "id": log.id,
        "category": log.category.value if hasattr(log.category, "value") else log.category,
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "user_id": log.user_id,
        "ip_address": log.ip_address,
        "severity": log.severity,
        "details": log.details,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("")
async def list_audit_logs(
    category: str | None = Query(
        None, description="Filter by category (auth/security/admin/data/system)"
    ),
    action: str | None = Query(None, description="Filter by action name"),
    severity: str | None = Query(None, description="Filter by severity (info/warning/critical)"),
    user_id: str | None = Query(None, description="Filter by actor user ID"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List audit log entries with optional filters. Requires active account."""
    await _require_admin(user, db)

    query = select(AuditLog)

    if category:
        query = query.where(AuditLog.category == category)
    if action:
        query = query.where(AuditLog.action == action)
    if severity:
        query = query.where(AuditLog.severity == severity)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)

    query = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return {"items": [_log_to_dict(log) for log in logs], "offset": offset, "limit": limit}


@router.get("/stats")
async def audit_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate audit stats: counts by category and severity."""
    await _require_admin(user, db)

    # Category counts
    cat_q = select(AuditLog.category, func.count()).group_by(AuditLog.category)
    cat_result = await db.execute(cat_q)
    by_category = {
        (row[0].value if hasattr(row[0], "value") else row[0]): row[1] for row in cat_result.all()
    }

    # Severity counts
    sev_q = select(AuditLog.severity, func.count()).group_by(AuditLog.severity)
    sev_result = await db.execute(sev_q)
    by_severity = {row[0]: row[1] for row in sev_result.all()}

    # Total
    total_q = select(func.count()).select_from(AuditLog)
    total = (await db.execute(total_q)).scalar() or 0

    return {
        "total": total,
        "by_category": by_category,
        "by_severity": by_severity,
    }
