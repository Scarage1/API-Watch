"""
Real-Time Collaboration Hub for API-Watch Enterprise.

Enables:
  - Presence tracking (who's online, what they're viewing)
  - Live cursor sharing in request editors
  - Real-time change broadcasting
  - Workspace-scoped collaboration rooms

Architecture:
  - WebSocket-based with room management
  - Each workspace = one collaboration room
  - Presence heartbeat every 30 seconds
  - Change events broadcast to all room members

Protocol:
  Client → Server messages:
    { "type": "join", "workspace_id": "...", "user": {...} }
    { "type": "cursor", "position": {...}, "file": "..." }
    { "type": "change", "resource_type": "request", "resource_id": "...", "delta": {...} }
    { "type": "leave" }

  Server → Client messages:
    { "type": "presence", "users": [...] }
    { "type": "cursor_update", "user_id": "...", "position": {...} }
    { "type": "change_broadcast", "user_id": "...", "resource_type": "...", ... }
    { "type": "user_joined", "user": {...} }
    { "type": "user_left", "user_id": "..." }
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("apiwatch.enterprise.collaboration")


# ── Types ─────────────────────────────────────────────────────
@dataclass
class CollaboratorInfo:
    """Information about an active collaborator."""

    user_id: str
    username: str
    email: str
    avatar_color: str = "#6366f1"  # Brand color default
    cursor_position: dict[str, Any] | None = None
    active_resource: str | None = None  # resource_type:resource_id
    last_heartbeat: float = field(default_factory=time.time)

    @property
    def is_stale(self) -> bool:
        """User is stale if no heartbeat for 60 seconds."""
        return time.time() - self.last_heartbeat > 60

    def to_dict(self) -> dict[str, Any]:
        return {
            "user_id": self.user_id,
            "username": self.username,
            "email": self.email,
            "avatar_color": self.avatar_color,
            "cursor_position": self.cursor_position,
            "active_resource": self.active_resource,
            "last_heartbeat": self.last_heartbeat,
        }


@dataclass
class CollaborationRoom:
    """A workspace collaboration room."""

    workspace_id: str
    members: dict[str, CollaboratorInfo] = field(default_factory=dict)
    connections: dict[str, Any] = field(default_factory=dict)  # user_id → WebSocket
    created_at: float = field(default_factory=time.time)

    @property
    def active_count(self) -> int:
        return sum(1 for m in self.members.values() if not m.is_stale)


# ── Collaboration Hub ────────────────────────────────────────
class CollaborationHub:
    """
    Central hub for real-time collaboration.

    Manages workspace rooms, handles WebSocket connections,
    and broadcasts events to connected collaborators.

    Usage:
        hub = CollaborationHub()
        await hub.handle_connection(websocket, workspace_id, user_info)
    """

    def __init__(self):
        self._rooms: dict[str, CollaborationRoom] = {}
        self._user_rooms: dict[str, str] = {}  # user_id → workspace_id

    # ── Room Management ───────────────────────────────────────

    def _get_or_create_room(self, workspace_id: str) -> CollaborationRoom:
        """Get or create a collaboration room for a workspace."""
        if workspace_id not in self._rooms:
            self._rooms[workspace_id] = CollaborationRoom(workspace_id=workspace_id)
            logger.info("Collaboration room created: %s", workspace_id)
        return self._rooms[workspace_id]

    def get_room_info(self, workspace_id: str) -> dict[str, Any] | None:
        """Get room info without creating it."""
        room = self._rooms.get(workspace_id)
        if not room:
            return None
        return {
            "workspace_id": workspace_id,
            "active_users": room.active_count,
            "members": [m.to_dict() for m in room.members.values() if not m.is_stale],
        }

    # ── Connection Handling ───────────────────────────────────

    async def handle_connection(
        self,
        websocket: Any,  # fastapi.WebSocket
        workspace_id: str,
        user_info: dict[str, str],
    ) -> None:
        """
        Handle a WebSocket connection for real-time collaboration.
        This is the main entry point — runs for the lifetime of the connection.
        """
        user_id = user_info["user_id"]
        room = self._get_or_create_room(workspace_id)

        # Register user
        collaborator = CollaboratorInfo(
            user_id=user_id,
            username=user_info.get("username", ""),
            email=user_info.get("email", ""),
            avatar_color=self._generate_avatar_color(user_id),
        )
        room.members[user_id] = collaborator
        room.connections[user_id] = websocket
        self._user_rooms[user_id] = workspace_id

        logger.info("User %s joined room %s (%d active)", user_id, workspace_id, room.active_count)

        # Notify others
        await self._broadcast(
            room,
            {
                "type": "user_joined",
                "user": collaborator.to_dict(),
            },
            exclude=user_id,
        )

        # Send current presence to the new user
        await self._send(
            websocket,
            {
                "type": "presence",
                "users": [m.to_dict() for m in room.members.values() if not m.is_stale],
            },
        )

        try:
            # Message loop
            while True:
                raw = await websocket.receive_text()
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                await self._handle_message(room, user_id, message)

        except Exception as e:
            logger.debug("Connection closed for user %s: %s", user_id, type(e).__name__)
        finally:
            await self._disconnect(room, user_id)

    async def _handle_message(
        self,
        room: CollaborationRoom,
        user_id: str,
        message: dict[str, Any],
    ) -> None:
        """Route incoming WebSocket messages."""
        msg_type = message.get("type", "")
        member = room.members.get(user_id)
        if not member:
            return

        # Update heartbeat on any message
        member.last_heartbeat = time.time()

        if msg_type == "cursor":
            member.cursor_position = message.get("position")
            member.active_resource = message.get("resource")
            await self._broadcast(
                room,
                {
                    "type": "cursor_update",
                    "user_id": user_id,
                    "position": member.cursor_position,
                    "resource": member.active_resource,
                },
                exclude=user_id,
            )

        elif msg_type == "change":
            await self._broadcast(
                room,
                {
                    "type": "change_broadcast",
                    "user_id": user_id,
                    "resource_type": message.get("resource_type"),
                    "resource_id": message.get("resource_id"),
                    "delta": message.get("delta"),
                    "timestamp": time.time(),
                },
                exclude=user_id,
            )

        elif msg_type == "heartbeat":
            # Just update the heartbeat timestamp (done above)
            pass

        elif msg_type == "request_presence":
            ws = room.connections.get(user_id)
            if ws:
                await self._send(
                    ws,
                    {
                        "type": "presence",
                        "users": [m.to_dict() for m in room.members.values() if not m.is_stale],
                    },
                )

    async def _disconnect(self, room: CollaborationRoom, user_id: str) -> None:
        """Handle user disconnection."""
        room.members.pop(user_id, None)
        room.connections.pop(user_id, None)
        self._user_rooms.pop(user_id, None)

        # Notify remaining users
        await self._broadcast(
            room,
            {
                "type": "user_left",
                "user_id": user_id,
            },
        )

        # Clean up empty rooms
        if not room.members:
            self._rooms.pop(room.workspace_id, None)
            logger.info("Collaboration room closed: %s (empty)", room.workspace_id)
        else:
            logger.info(
                "User %s left room %s (%d remaining)", user_id, room.workspace_id, room.active_count
            )

    # ── Broadcasting ──────────────────────────────────────────

    async def _broadcast(
        self,
        room: CollaborationRoom,
        message: dict[str, Any],
        exclude: str | None = None,
    ) -> None:
        """Broadcast a message to all connections in a room."""
        payload = json.dumps(message)
        disconnected = []

        for uid, ws in room.connections.items():
            if uid == exclude:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append(uid)

        # Clean up broken connections
        for uid in disconnected:
            room.members.pop(uid, None)
            room.connections.pop(uid, None)

    async def _send(self, websocket: Any, message: dict[str, Any]) -> None:
        """Send a message to a single connection."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.debug("Failed to send to websocket: %s", e)

    # ── Utilities ─────────────────────────────────────────────

    @staticmethod
    def _generate_avatar_color(user_id: str) -> str:
        """Generate a consistent color for a user based on their ID."""
        colors = [
            "#6366f1",
            "#8b5cf6",
            "#a855f7",
            "#d946ef",
            "#ec4899",
            "#f43f5e",
            "#ef4444",
            "#f97316",
            "#eab308",
            "#22c55e",
            "#14b8a6",
            "#06b6d4",
            "#3b82f6",
            "#6366f1",
        ]
        idx = sum(ord(c) for c in user_id) % len(colors)
        return colors[idx]

    # ── Stats ─────────────────────────────────────────────────

    def get_stats(self) -> dict[str, Any]:
        """Get collaboration statistics."""
        total_users = sum(r.active_count for r in self._rooms.values())
        return {
            "active_rooms": len(self._rooms),
            "total_active_users": total_users,
            "rooms": {
                ws_id: {
                    "active_users": room.active_count,
                    "total_members": len(room.members),
                }
                for ws_id, room in self._rooms.items()
            },
        }

    # ── Cleanup ───────────────────────────────────────────────

    async def cleanup_stale_users(self) -> int:
        """Remove stale users from all rooms. Call periodically."""
        removed = 0
        empty_rooms = []

        for ws_id, room in self._rooms.items():
            stale = [uid for uid, m in room.members.items() if m.is_stale]
            for uid in stale:
                await self._disconnect(room, uid)
                removed += 1
            if not room.members:
                empty_rooms.append(ws_id)

        for ws_id in empty_rooms:
            self._rooms.pop(ws_id, None)

        if removed:
            logger.info("Cleaned up %d stale collaborators", removed)
        return removed


# ── Global singleton ──────────────────────────────────────────
_hub: CollaborationHub | None = None


def get_collaboration_hub() -> CollaborationHub:
    """Get or create the global collaboration hub singleton."""
    global _hub
    if _hub is None:
        _hub = CollaborationHub()
    return _hub
