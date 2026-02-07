"""
Notification channel CRUD routes — manage email, webhook, and Slack channels.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import (
    User, NotificationChannel, ChannelType,
    ActivityLog, ActivityAction,
)
from ..jwt_auth import get_current_user
from ..rbac import get_workspace_id

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str
    channel_type: str  # "email" | "webhook" | "slack"
    config: dict
    enabled: bool = True


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None
    enabled: Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _channel_to_dict(ch: NotificationChannel) -> dict:
    return {
        "id": ch.id,
        "name": ch.name,
        "channel_type": ch.channel_type.value,
        "config": ch.config,
        "enabled": ch.enabled,
        "created_at": ch.created_at.isoformat(),
        "updated_at": ch.updated_at.isoformat(),
    }


def _validate_channel_type(channel_type: str) -> ChannelType:
    try:
        return ChannelType(channel_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid channel type. Must be one of: {', '.join(t.value for t in ChannelType)}",
        )


def _validate_channel_config(channel_type: ChannelType, config: dict) -> None:
    """Basic validation for channel configuration."""
    if channel_type == ChannelType.EMAIL:
        if "recipients" not in config or not isinstance(config["recipients"], list):
            raise HTTPException(status_code=400, detail="Email channel requires 'recipients' list in config")
    elif channel_type == ChannelType.WEBHOOK:
        if "url" not in config:
            raise HTTPException(status_code=400, detail="Webhook channel requires 'url' in config")
    elif channel_type == ChannelType.SLACK:
        if "webhook_url" not in config:
            raise HTTPException(status_code=400, detail="Slack channel requires 'webhook_url' in config")


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_channel(
    body: ChannelCreate,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a notification channel."""
    ch_type = _validate_channel_type(body.channel_type)
    _validate_channel_config(ch_type, body.config)

    channel = NotificationChannel(
        name=body.name,
        channel_type=ch_type,
        config=body.config,
        enabled=body.enabled,
        owner_id=user.id,
        workspace_id=workspace_id,
    )
    db.add(channel)

    log = ActivityLog(
        workspace_id=workspace_id, user_id=user.id,
        action=ActivityAction.CREATED, resource_type="notification_channel",
        resource_id=None, resource_name=body.name,
    )
    db.add(log)

    await db.commit()
    await db.refresh(channel)

    log.resource_id = channel.id
    await db.commit()

    return _channel_to_dict(channel)


@router.get("")
async def list_channels(
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List notification channels for the current workspace."""
    query = select(NotificationChannel)
    if workspace_id:
        query = query.where(NotificationChannel.workspace_id == workspace_id)
    else:
        query = query.where(NotificationChannel.owner_id == user.id)
    query = query.order_by(NotificationChannel.created_at.desc())
    result = await db.execute(query)
    channels = result.scalars().all()
    return [_channel_to_dict(ch) for ch in channels]


@router.get("/{channel_id}")
async def get_channel(
    channel_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a notification channel."""
    query = select(NotificationChannel).where(NotificationChannel.id == channel_id)
    if workspace_id:
        query = query.where(NotificationChannel.workspace_id == workspace_id)
    else:
        query = query.where(NotificationChannel.owner_id == user.id)
    result = await db.execute(query)
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return _channel_to_dict(channel)


@router.put("/{channel_id}")
async def update_channel(
    channel_id: str,
    body: ChannelUpdate,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Update a notification channel."""
    query = select(NotificationChannel).where(NotificationChannel.id == channel_id)
    if workspace_id:
        query = query.where(NotificationChannel.workspace_id == workspace_id)
    else:
        query = query.where(NotificationChannel.owner_id == user.id)
    result = await db.execute(query)
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    update_data = body.model_dump(exclude_unset=True)
    if "config" in update_data:
        _validate_channel_config(channel.channel_type, update_data["config"])

    for key, value in update_data.items():
        setattr(channel, key, value)

    await db.commit()
    await db.refresh(channel)
    return _channel_to_dict(channel)


@router.delete("/{channel_id}", status_code=204)
async def delete_channel(
    channel_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a notification channel."""
    query = select(NotificationChannel).where(NotificationChannel.id == channel_id)
    if workspace_id:
        query = query.where(NotificationChannel.workspace_id == workspace_id)
    else:
        query = query.where(NotificationChannel.owner_id == user.id)
    result = await db.execute(query)
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    log = ActivityLog(
        workspace_id=workspace_id, user_id=user.id,
        action=ActivityAction.DELETED, resource_type="notification_channel",
        resource_id=channel.id, resource_name=channel.name,
    )
    db.add(log)

    await db.delete(channel)
    await db.commit()


# ── Test Notification ─────────────────────────────────────────────────────────

@router.post("/{channel_id}/test")
async def test_channel(
    channel_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Send a test notification through the channel."""
    query = select(NotificationChannel).where(NotificationChannel.id == channel_id)
    if workspace_id:
        query = query.where(NotificationChannel.workspace_id == workspace_id)
    else:
        query = query.where(NotificationChannel.owner_id == user.id)
    result = await db.execute(query)
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    from ..notifier import send_notification

    success = await send_notification(
        channel,
        subject="API-Watch Test Notification",
        message="This is a test notification from API-Watch. If you received this, your channel is configured correctly!",
    )

    if success:
        return {"detail": "Test notification sent successfully"}
    raise HTTPException(status_code=500, detail="Failed to send test notification")
