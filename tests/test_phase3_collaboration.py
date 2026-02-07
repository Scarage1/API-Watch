"""
Phase 3 tests — Shared Collections, Versioning & Activity.

Covers:
  - Collection sharing (share, unshare, list shares, shared-with-me)
  - Collection forking (full clone, forked_from_id, access control)
  - Collection versioning (create/list/get/restore snapshots, auto-backup)
  - Activity logging (auto-logged events, query & filter)
  - Environment scope & secrets masking
"""
import pytest
from typing import Optional
from httpx import AsyncClient


# ── Helpers ───────────────────────────────────────────────────────────────────

async def register_user(client: AsyncClient, email: str, username: str, password: str = "TestPass123"):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert res.status_code == 201, f"Registration failed: {res.text}"
    data = res.json()
    return data["access_token"], data["user"]


async def auth_headers(client: AsyncClient, email: str, username: str):
    token, user = await register_user(client, email, username)
    return {"Authorization": f"Bearer {token}"}, user


async def create_workspace(client: AsyncClient, headers: dict, name: str):
    res = await client.post("/api/v1/workspaces", json={"name": name}, headers=headers)
    assert res.status_code == 201, f"Workspace creation failed: {res.text}"
    return res.json()


async def create_collection(
    client: AsyncClient, headers: dict, name: str, workspace_id: Optional[str] = None,
) -> dict:
    h = {**headers}
    if workspace_id:
        h["X-Workspace-Id"] = workspace_id
    res = await client.post("/api/v1/collections", json={"name": name}, headers=h)
    assert res.status_code == 201, f"Collection creation failed: {res.text}"
    return res.json()


async def save_request(
    client: AsyncClient, headers: dict, collection_id: str, name: str,
    method: str = "GET", url: str = "https://api.example.com/test",
):
    res = await client.post(
        f"/api/v1/collections/{collection_id}/requests",
        json={
            "name": name,
            "method": method,
            "url": url,
            "headers": {},
            "params": {},
            "timeout": 10,
        },
        headers=headers,
    )
    assert res.status_code == 201, f"Save request failed: {res.text}"
    return res.json()


# ══════════════════════════════════════════════════════════════════════════════
#  COLLECTION SHARING
# ══════════════════════════════════════════════════════════════════════════════

class TestCollectionSharing:

    @pytest.mark.asyncio
    async def test_share_collection_with_workspace(self, client: AsyncClient):
        """Owner shares collection with another workspace."""
        headers, user = await auth_headers(client, "share1@test.dev", "share1")
        ws_id = user["default_workspace_id"]

        # Create a second workspace
        ws2 = await create_workspace(client, headers, "Target WS")

        # Create collection in default workspace
        col = await create_collection(client, headers, "Shared Col", ws_id)

        # Share with second workspace
        res = await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "read"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["collection_id"] == col["id"]
        assert data["workspace_id"] == ws2["id"]
        assert data["permission"] == "read"

    @pytest.mark.asyncio
    async def test_share_write_permission(self, client: AsyncClient):
        """Share with write permission."""
        headers, user = await auth_headers(client, "share2@test.dev", "share2")
        ws_id = user["default_workspace_id"]
        ws2 = await create_workspace(client, headers, "WS Write")
        col = await create_collection(client, headers, "Write Col", ws_id)

        res = await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "write"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 201
        assert res.json()["permission"] == "write"

    @pytest.mark.asyncio
    async def test_share_duplicate_rejected(self, client: AsyncClient):
        """Duplicate share with same workspace should 409."""
        headers, user = await auth_headers(client, "share3@test.dev", "share3")
        ws_id = user["default_workspace_id"]
        ws2 = await create_workspace(client, headers, "Dup WS")
        col = await create_collection(client, headers, "Dup Col", ws_id)

        await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "read"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        res = await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "write"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 409

    @pytest.mark.asyncio
    async def test_share_with_own_workspace_rejected(self, client: AsyncClient):
        """Cannot share with the workspace that owns the collection."""
        headers, user = await auth_headers(client, "share4@test.dev", "share4")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "Self Col", ws_id)

        res = await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws_id, "permission": "read"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_share_invalid_permission(self, client: AsyncClient):
        """Invalid permission should 400."""
        headers, user = await auth_headers(client, "share5@test.dev", "share5")
        ws_id = user["default_workspace_id"]
        ws2 = await create_workspace(client, headers, "Inv WS")
        col = await create_collection(client, headers, "Inv Col", ws_id)

        res = await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "admin"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_list_shares(self, client: AsyncClient):
        """List workspaces a collection is shared with."""
        headers, user = await auth_headers(client, "share6@test.dev", "share6")
        ws_id = user["default_workspace_id"]
        ws2 = await create_workspace(client, headers, "List WS")
        col = await create_collection(client, headers, "List Col", ws_id)

        await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "read"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        res = await client.get(
            f"/api/v1/collections/{col['id']}/shares",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        shares = res.json()
        assert len(shares) == 1
        assert shares[0]["workspace_id"] == ws2["id"]
        assert shares[0]["workspace_name"] == "List WS"

    @pytest.mark.asyncio
    async def test_unshare_collection(self, client: AsyncClient):
        """Remove a share."""
        headers, user = await auth_headers(client, "share7@test.dev", "share7")
        ws_id = user["default_workspace_id"]
        ws2 = await create_workspace(client, headers, "Unshr WS")
        col = await create_collection(client, headers, "Unshr Col", ws_id)

        share_res = await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "read"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        share_id = share_res.json()["id"]

        res = await client.delete(
            f"/api/v1/collections/{col['id']}/share/{share_id}",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 204

        # Verify removed
        list_res = await client.get(
            f"/api/v1/collections/{col['id']}/shares",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert len(list_res.json()) == 0

    @pytest.mark.asyncio
    async def test_shared_with_me(self, client: AsyncClient):
        """List collections shared with the current workspace."""
        headers, user = await auth_headers(client, "share8@test.dev", "share8")
        ws_id = user["default_workspace_id"]
        ws2 = await create_workspace(client, headers, "My WS")
        col = await create_collection(client, headers, "Shared To Me", ws_id)

        await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "read"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        res = await client.get(
            "/api/v1/collections/shared",
            headers={**headers, "X-Workspace-Id": ws2["id"]},
        )
        assert res.status_code == 200
        shared = res.json()
        assert len(shared) == 1
        assert shared[0]["name"] == "Shared To Me"
        assert shared[0]["permission"] == "read"


# ══════════════════════════════════════════════════════════════════════════════
#  COLLECTION FORKING
# ══════════════════════════════════════════════════════════════════════════════

class TestCollectionForking:

    @pytest.mark.asyncio
    async def test_fork_own_collection(self, client: AsyncClient):
        """Fork a collection the user owns."""
        headers, user = await auth_headers(client, "fork1@test.dev", "fork1")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "Original", ws_id)

        # Add some requests
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "Req A", "GET")
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "Req B", "POST")

        res = await client.post(
            f"/api/v1/collections/{col['id']}/fork",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "Original (fork)"
        assert data["forked_from_id"] == col["id"]
        assert data["request_count"] == 2

    @pytest.mark.asyncio
    async def test_fork_shared_collection(self, client: AsyncClient):
        """Fork a collection that was shared with my workspace."""
        headers, user = await auth_headers(client, "fork2@test.dev", "fork2")
        ws_id = user["default_workspace_id"]
        ws2 = await create_workspace(client, headers, "Fork Target")
        col = await create_collection(client, headers, "To Fork", ws_id)
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "R1")

        # Share with ws2
        await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "read"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        # Fork into ws2
        res = await client.post(
            f"/api/v1/collections/{col['id']}/fork",
            headers={**headers, "X-Workspace-Id": ws2["id"]},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["forked_from_id"] == col["id"]
        assert data["workspace_id"] == ws2["id"]

    @pytest.mark.asyncio
    async def test_fork_no_access_rejected(self, client: AsyncClient):
        """Fork a collection without access should 403."""
        h1, u1 = await auth_headers(client, "fork3a@test.dev", "fork3a")
        h2, u2 = await auth_headers(client, "fork3b@test.dev", "fork3b")
        ws1 = u1["default_workspace_id"]
        ws2 = u2["default_workspace_id"]

        col = await create_collection(client, h1, "Private Col", ws1)

        res = await client.post(
            f"/api/v1/collections/{col['id']}/fork",
            headers={**h2, "X-Workspace-Id": ws2},
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_fork_preserves_all_requests(self, client: AsyncClient):
        """Forked collection should have identical requests."""
        headers, user = await auth_headers(client, "fork4@test.dev", "fork4")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "Full Fork", ws_id)

        methods = ["GET", "POST", "PUT", "DELETE", "PATCH"]
        for i, m in enumerate(methods):
            await save_request(
                client, {**headers, "X-Workspace-Id": ws_id},
                col["id"], f"Req {m}", m, f"https://api.example.com/{m.lower()}"
            )

        fork_res = await client.post(
            f"/api/v1/collections/{col['id']}/fork",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert fork_res.status_code == 201
        assert fork_res.json()["request_count"] == 5


# ══════════════════════════════════════════════════════════════════════════════
#  COLLECTION VERSIONING (SNAPSHOTS)
# ══════════════════════════════════════════════════════════════════════════════

class TestCollectionVersioning:

    @pytest.mark.asyncio
    async def test_create_snapshot(self, client: AsyncClient):
        """Create a snapshot of a collection."""
        headers, user = await auth_headers(client, "ver1@test.dev", "ver1")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "Snap Col", ws_id)
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "R1")

        res = await client.post(
            f"/api/v1/collections/{col['id']}/snapshots",
            json={"label": "v1 - initial"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["version"] == 1
        assert data["label"] == "v1 - initial"
        assert data["request_count"] == 1

    @pytest.mark.asyncio
    async def test_create_multiple_snapshots_increment_version(self, client: AsyncClient):
        """Multiple snapshots should auto-increment version."""
        headers, user = await auth_headers(client, "ver2@test.dev", "ver2")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "Multi Snap", ws_id)

        for i in range(1, 4):
            res = await client.post(
                f"/api/v1/collections/{col['id']}/snapshots",
                json={"label": f"v{i}"},
                headers={**headers, "X-Workspace-Id": ws_id},
            )
            assert res.status_code == 201
            assert res.json()["version"] == i

    @pytest.mark.asyncio
    async def test_list_snapshots_newest_first(self, client: AsyncClient):
        """List snapshots in reverse chronological order."""
        headers, user = await auth_headers(client, "ver3@test.dev", "ver3")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "List Snap", ws_id)

        for i in range(1, 4):
            await client.post(
                f"/api/v1/collections/{col['id']}/snapshots",
                json={"label": f"snap-{i}"},
                headers={**headers, "X-Workspace-Id": ws_id},
            )

        res = await client.get(
            f"/api/v1/collections/{col['id']}/snapshots",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        snaps = res.json()
        assert len(snaps) == 3
        assert snaps[0]["version"] == 3  # newest first
        assert snaps[2]["version"] == 1

    @pytest.mark.asyncio
    async def test_get_snapshot_detail(self, client: AsyncClient):
        """Get full snapshot data."""
        headers, user = await auth_headers(client, "ver4@test.dev", "ver4")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "Detail Snap", ws_id)
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "Detailed Req", "POST")

        snap_res = await client.post(
            f"/api/v1/collections/{col['id']}/snapshots",
            json={},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        snap_id = snap_res.json()["id"]

        res = await client.get(
            f"/api/v1/collections/{col['id']}/snapshots/{snap_id}",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        data = res.json()
        assert "snapshot_data" in data
        assert len(data["snapshot_data"]["requests"]) == 1
        assert data["snapshot_data"]["requests"][0]["name"] == "Detailed Req"
        assert data["snapshot_data"]["requests"][0]["method"] == "POST"

    @pytest.mark.asyncio
    async def test_restore_snapshot(self, client: AsyncClient):
        """Restore a collection from a snapshot."""
        headers, user = await auth_headers(client, "ver5@test.dev", "ver5")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "Restore Col", ws_id)

        # Add 2 requests and snapshot
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "Before A")
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "Before B")
        snap_res = await client.post(
            f"/api/v1/collections/{col['id']}/snapshots",
            json={"label": "baseline"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        snap_id = snap_res.json()["id"]
        assert snap_res.json()["request_count"] == 2

        # Add a 3rd request (changing state)
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "After C")

        # Restore to snapshot
        res = await client.post(
            f"/api/v1/collections/{col['id']}/snapshots/{snap_id}/restore",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        assert res.json()["restored_version"] == 1

        # Verify collection now has 2 requests again
        col_res = await client.get(
            f"/api/v1/collections/{col['id']}",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert col_res.status_code == 200
        assert len(col_res.json()["requests"]) == 2

    @pytest.mark.asyncio
    async def test_restore_creates_auto_backup(self, client: AsyncClient):
        """Restore should auto-create a backup snapshot."""
        headers, user = await auth_headers(client, "ver6@test.dev", "ver6")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "Backup Col", ws_id)
        await save_request(client, {**headers, "X-Workspace-Id": ws_id}, col["id"], "R1")

        snap_res = await client.post(
            f"/api/v1/collections/{col['id']}/snapshots",
            json={"label": "original"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        snap_id = snap_res.json()["id"]

        # Restore
        restore_res = await client.post(
            f"/api/v1/collections/{col['id']}/snapshots/{snap_id}/restore",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert restore_res.status_code == 200
        backup_version = restore_res.json()["backup_version"]
        assert backup_version == 2  # auto-backup is v2

        # List snapshots — should have 2 now (original + backup)
        list_res = await client.get(
            f"/api/v1/collections/{col['id']}/snapshots",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        snaps = list_res.json()
        assert len(snaps) == 2
        labels = [s["label"] for s in snaps]
        assert any("Auto-backup" in (l or "") for l in labels)

    @pytest.mark.asyncio
    async def test_snapshot_not_found(self, client: AsyncClient):
        """Get nonexistent snapshot returns 404."""
        headers, user = await auth_headers(client, "ver7@test.dev", "ver7")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, headers, "NF Col", ws_id)

        res = await client.get(
            f"/api/v1/collections/{col['id']}/snapshots/nonexistent-id",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
#  ACTIVITY LOGGING
# ══════════════════════════════════════════════════════════════════════════════

class TestActivityLog:

    @pytest.mark.asyncio
    async def test_activity_logged_on_collection_create(self, client: AsyncClient):
        """Creating a collection should log an activity."""
        headers, user = await auth_headers(client, "act1@test.dev", "act1")
        ws_id = user["default_workspace_id"]
        await create_collection(client, {**headers, "X-Workspace-Id": ws_id}, "Logged Col", ws_id)

        res = await client.get(
            "/api/v1/activity?resource_type=collection",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        logs = res.json()
        assert len(logs) >= 1
        assert any(log["action"] == "created" and "Logged Col" in log["resource_name"] for log in logs)

    @pytest.mark.asyncio
    async def test_activity_logged_on_share(self, client: AsyncClient):
        """Sharing a collection should log a 'shared' activity."""
        headers, user = await auth_headers(client, "act2@test.dev", "act2")
        ws_id = user["default_workspace_id"]
        ws2 = await create_workspace(client, headers, "Act WS2")
        col = await create_collection(client, {**headers, "X-Workspace-Id": ws_id}, "Act Col", ws_id)

        await client.post(
            f"/api/v1/collections/{col['id']}/share",
            json={"workspace_id": ws2["id"], "permission": "read"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        res = await client.get(
            "/api/v1/activity",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        logs = res.json()
        shared_logs = [l for l in logs if l["action"] == "shared"]
        assert len(shared_logs) >= 1

    @pytest.mark.asyncio
    async def test_activity_logged_on_fork(self, client: AsyncClient):
        """Forking a collection should log a 'forked' activity."""
        headers, user = await auth_headers(client, "act3@test.dev", "act3")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, {**headers, "X-Workspace-Id": ws_id}, "Fork Act", ws_id)

        await client.post(
            f"/api/v1/collections/{col['id']}/fork",
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        res = await client.get(
            "/api/v1/activity",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        logs = res.json()
        forked_logs = [l for l in logs if l["action"] == "forked"]
        assert len(forked_logs) >= 1

    @pytest.mark.asyncio
    async def test_activity_includes_user_email(self, client: AsyncClient):
        """Activity entries should include user_email."""
        headers, user = await auth_headers(client, "act4@test.dev", "act4")
        ws_id = user["default_workspace_id"]
        await create_collection(client, {**headers, "X-Workspace-Id": ws_id}, "Email Col", ws_id)

        res = await client.get(
            "/api/v1/activity",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        logs = res.json()
        assert len(logs) >= 1
        assert logs[0].get("user_email") == "act4@test.dev"

    @pytest.mark.asyncio
    async def test_activity_filter_by_resource_type(self, client: AsyncClient):
        """Filter activity by resource_type."""
        headers, user = await auth_headers(client, "act5@test.dev", "act5")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, {**headers, "X-Workspace-Id": ws_id}, "Filter Col", ws_id)

        # Create a snapshot too
        await client.post(
            f"/api/v1/collections/{col['id']}/snapshots",
            json={"label": "snap"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        # Filter: only snapshots
        res = await client.get(
            "/api/v1/activity?resource_type=snapshot",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        logs = res.json()
        assert len(logs) >= 1
        assert all(l["resource_type"] == "snapshot" for l in logs)

    @pytest.mark.asyncio
    async def test_activity_pagination(self, client: AsyncClient):
        """Activity should support limit & offset."""
        headers, user = await auth_headers(client, "act6@test.dev", "act6")
        ws_id = user["default_workspace_id"]

        # Create 5 collections to generate 5 log entries
        for i in range(5):
            await create_collection(
                client, {**headers, "X-Workspace-Id": ws_id}, f"Page Col {i}", ws_id,
            )

        res = await client.get(
            "/api/v1/activity?limit=2&offset=0",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

        res2 = await client.get(
            "/api/v1/activity?limit=2&offset=2",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res2.status_code == 200
        assert len(res2.json()) == 2

    @pytest.mark.asyncio
    async def test_activity_on_collection_delete(self, client: AsyncClient):
        """Deleting a collection should log 'deleted' activity."""
        headers, user = await auth_headers(client, "act7@test.dev", "act7")
        ws_id = user["default_workspace_id"]
        col = await create_collection(client, {**headers, "X-Workspace-Id": ws_id}, "Del Act", ws_id)

        await client.delete(
            f"/api/v1/collections/{col['id']}",
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        res = await client.get(
            "/api/v1/activity?resource_type=collection",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        logs = res.json()
        deleted_logs = [l for l in logs if l["action"] == "deleted"]
        assert len(deleted_logs) >= 1


# ══════════════════════════════════════════════════════════════════════════════
#  ENVIRONMENT SCOPE & SECRETS
# ══════════════════════════════════════════════════════════════════════════════

class TestEnvironmentScope:

    @pytest.mark.asyncio
    async def test_create_environment_with_scope(self, client: AsyncClient):
        """Create environment with workspace scope."""
        headers, user = await auth_headers(client, "env1@test.dev", "env1")
        ws_id = user["default_workspace_id"]

        res = await client.post(
            "/api/v1/environments",
            json={
                "name": "Staging",
                "variables": {"API_URL": "https://staging.api.com", "SECRET": "s3cr3t"},
                "scope": "workspace",
                "secret_keys": ["SECRET"],
            },
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["scope"] == "workspace"
        assert data["secret_keys"] == ["SECRET"]

    @pytest.mark.asyncio
    async def test_secret_keys_masked_in_list(self, client: AsyncClient):
        """Secret keys should be masked when listing environments."""
        headers, user = await auth_headers(client, "env2@test.dev", "env2")
        ws_id = user["default_workspace_id"]

        await client.post(
            "/api/v1/environments",
            json={
                "name": "Masked Env",
                "variables": {"API_KEY": "abc123", "DB_PASS": "secret"},
                "scope": "personal",
                "secret_keys": ["API_KEY", "DB_PASS"],
            },
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        res = await client.get(
            "/api/v1/environments",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        envs = res.json()
        assert len(envs) >= 1
        env = next(e for e in envs if e["name"] == "Masked Env")
        assert env["variables"]["API_KEY"] == "••••••••"
        assert env["variables"]["DB_PASS"] == "••••••••"

    @pytest.mark.asyncio
    async def test_active_env_shows_unmasked(self, client: AsyncClient):
        """Active environment should return unmasked values for execution."""
        headers, user = await auth_headers(client, "env3@test.dev", "env3")
        ws_id = user["default_workspace_id"]

        await client.post(
            "/api/v1/environments",
            json={
                "name": "Active Env",
                "variables": {"TOKEN": "real-token"},
                "scope": "personal",
                "secret_keys": ["TOKEN"],
                "is_active": True,
            },
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        res = await client.get(
            "/api/v1/environments/active",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        data = res.json()
        # Active endpoint shows real values (for execution)
        assert data is not None
        assert data["variables"]["TOKEN"] == "real-token"

    @pytest.mark.asyncio
    async def test_default_scope_is_personal(self, client: AsyncClient):
        """Default scope should be 'personal'."""
        headers, user = await auth_headers(client, "env4@test.dev", "env4")
        ws_id = user["default_workspace_id"]

        await client.post(
            "/api/v1/environments",
            json={"name": "Default Scope", "variables": {"K": "V"}},
            headers={**headers, "X-Workspace-Id": ws_id},
        )

        res = await client.get(
            "/api/v1/environments",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        envs = res.json()
        env = next(e for e in envs if e["name"] == "Default Scope")
        assert env["scope"] == "personal"
        assert env["secret_keys"] == []
