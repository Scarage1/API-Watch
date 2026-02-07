"""
Phase 2 tests — Teams, Workspaces & RBAC.

Covers:
  - Organization CRUD
  - Team CRUD & membership
  - Workspace CRUD & membership
  - RBAC enforcement (workspace roles)
  - Workspace-scoped collections/environments
  - Invitation flow (send, accept, decline, revoke)
  - Personal workspace auto-creation on registration
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient


# ── Helpers ───────────────────────────────────────────────────────────────────

async def register_user(client: AsyncClient, email: str, username: str, password: str = "TestPass123"):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert res.status_code == 201
    data = res.json()
    return data["access_token"], data["user"]


async def auth_headers(client: AsyncClient, email: str, username: str):
    token, user = await register_user(client, email, username)
    return {"Authorization": f"Bearer {token}"}, user


# ══════════════════════════════════════════════════════════════════════════════
#  PERSONAL WORKSPACE AUTO-CREATION
# ══════════════════════════════════════════════════════════════════════════════

class TestPersonalWorkspace:
    @pytest.mark.asyncio
    async def test_register_creates_personal_workspace(self, client: AsyncClient):
        """Registration should auto-create a personal workspace."""
        token, user = await register_user(client, "auto@test.dev", "autouser")
        assert user.get("default_workspace_id") is not None

        # List workspaces — should have 1 personal workspace
        res = await client.get(
            "/api/v1/workspaces",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        workspaces = res.json()
        assert len(workspaces) == 1
        assert workspaces[0]["is_personal"] is True
        assert workspaces[0]["my_role"] == "admin"

    @pytest.mark.asyncio
    async def test_profile_includes_default_workspace_id(self, client: AsyncClient):
        """GET /auth/me should return default_workspace_id."""
        token, user = await register_user(client, "profile@test.dev", "profileuser")
        res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        assert res.json().get("default_workspace_id") is not None


# ══════════════════════════════════════════════════════════════════════════════
#  ORGANIZATION CRUD
# ══════════════════════════════════════════════════════════════════════════════

class TestOrganizations:
    @pytest.mark.asyncio
    async def test_create_org(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "org@test.dev", "orguser")
        res = await client.post(
            "/api/v1/orgs",
            json={"name": "Test Org", "slug": "test-org"},
            headers=headers,
        )
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "Test Org"
        assert data["slug"] == "test-org"

    @pytest.mark.asyncio
    async def test_create_org_duplicate_slug(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "org2@test.dev", "orguser2")
        await client.post(
            "/api/v1/orgs",
            json={"name": "Org A", "slug": "dup-slug"},
            headers=headers,
        )
        res = await client.post(
            "/api/v1/orgs",
            json={"name": "Org B", "slug": "dup-slug"},
            headers=headers,
        )
        assert res.status_code == 409

    @pytest.mark.asyncio
    async def test_list_orgs(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "orglist@test.dev", "orglistuser")
        await client.post(
            "/api/v1/orgs",
            json={"name": "List Org", "slug": "list-org"},
            headers=headers,
        )
        res = await client.get("/api/v1/orgs", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) >= 1

    @pytest.mark.asyncio
    async def test_get_org(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "orgget@test.dev", "orggetuser")
        create_res = await client.post(
            "/api/v1/orgs",
            json={"name": "Get Org", "slug": "get-org"},
            headers=headers,
        )
        org_id = create_res.json()["id"]
        res = await client.get(f"/api/v1/orgs/{org_id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["name"] == "Get Org"

    @pytest.mark.asyncio
    async def test_update_org(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "orgup@test.dev", "orgupuser")
        create_res = await client.post(
            "/api/v1/orgs",
            json={"name": "Old Name", "slug": "old-name"},
            headers=headers,
        )
        org_id = create_res.json()["id"]
        res = await client.put(
            f"/api/v1/orgs/{org_id}",
            json={"name": "New Name"},
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["name"] == "New Name"

    @pytest.mark.asyncio
    async def test_delete_org(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "orgdel@test.dev", "orgdeluser")
        create_res = await client.post(
            "/api/v1/orgs",
            json={"name": "Del Org", "slug": "del-org"},
            headers=headers,
        )
        org_id = create_res.json()["id"]
        res = await client.delete(f"/api/v1/orgs/{org_id}", headers=headers)
        assert res.status_code == 204

    @pytest.mark.asyncio
    async def test_non_member_cannot_access_org(self, client: AsyncClient):
        headers_a, _ = await auth_headers(client, "orga@test.dev", "orgauser")
        headers_b, _ = await auth_headers(client, "orgb@test.dev", "orgbuser")
        create_res = await client.post(
            "/api/v1/orgs",
            json={"name": "Private Org", "slug": "private-org"},
            headers=headers_a,
        )
        org_id = create_res.json()["id"]
        res = await client.get(f"/api/v1/orgs/{org_id}", headers=headers_b)
        assert res.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
#  TEAM CRUD
# ══════════════════════════════════════════════════════════════════════════════

class TestTeams:
    @pytest.mark.asyncio
    async def test_create_team(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "team@test.dev", "teamuser")
        org_res = await client.post(
            "/api/v1/orgs",
            json={"name": "Team Org", "slug": "team-org"},
            headers=headers,
        )
        org_id = org_res.json()["id"]
        res = await client.post(
            f"/api/v1/orgs/{org_id}/teams",
            json={"name": "Backend", "description": "Backend team"},
            headers=headers,
        )
        assert res.status_code == 201
        assert res.json()["name"] == "Backend"

    @pytest.mark.asyncio
    async def test_list_teams(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "teamlist@test.dev", "teamlistuser")
        org_res = await client.post(
            "/api/v1/orgs",
            json={"name": "List Team Org", "slug": "list-team-org"},
            headers=headers,
        )
        org_id = org_res.json()["id"]
        res = await client.get(f"/api/v1/orgs/{org_id}/teams", headers=headers)
        assert res.status_code == 200
        # Should have auto-created "General" team
        assert len(res.json()) >= 1

    @pytest.mark.asyncio
    async def test_add_team_member(self, client: AsyncClient):
        headers_a, user_a = await auth_headers(client, "tma@test.dev", "tmauser")
        headers_b, user_b = await auth_headers(client, "tmb@test.dev", "tmbuser")
        org_res = await client.post(
            "/api/v1/orgs",
            json={"name": "Member Org", "slug": "member-org"},
            headers=headers_a,
        )
        org_id = org_res.json()["id"]
        teams = await client.get(f"/api/v1/orgs/{org_id}/teams", headers=headers_a)
        team_id = teams.json()[0]["id"]

        res = await client.post(
            f"/api/v1/orgs/{org_id}/teams/{team_id}/members",
            json={"user_id": user_b["id"], "role": "member"},
            headers=headers_a,
        )
        assert res.status_code == 201

    @pytest.mark.asyncio
    async def test_list_team_members(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "tmlm@test.dev", "tmlmuser")
        org_res = await client.post(
            "/api/v1/orgs",
            json={"name": "TM Org", "slug": "tm-org"},
            headers=headers,
        )
        org_id = org_res.json()["id"]
        teams = await client.get(f"/api/v1/orgs/{org_id}/teams", headers=headers)
        team_id = teams.json()[0]["id"]

        res = await client.get(
            f"/api/v1/orgs/{org_id}/teams/{team_id}/members",
            headers=headers,
        )
        assert res.status_code == 200
        assert len(res.json()) >= 1  # owner auto-added


# ══════════════════════════════════════════════════════════════════════════════
#  WORKSPACE CRUD
# ══════════════════════════════════════════════════════════════════════════════

class TestWorkspaces:
    @pytest.mark.asyncio
    async def test_create_workspace(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "ws@test.dev", "wsuser")
        res = await client.post(
            "/api/v1/workspaces",
            json={"name": "Project Alpha"},
            headers=headers,
        )
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "Project Alpha"
        assert data["is_personal"] is False
        assert data["my_role"] == "admin"

    @pytest.mark.asyncio
    async def test_list_workspaces(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "wslist@test.dev", "wslistuser")
        res = await client.get("/api/v1/workspaces", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) >= 1  # at least personal

    @pytest.mark.asyncio
    async def test_get_workspace(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "wsget@test.dev", "wsgetuser")
        create_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "Get WS"},
            headers=headers,
        )
        ws_id = create_res.json()["id"]
        res = await client.get(f"/api/v1/workspaces/{ws_id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["name"] == "Get WS"

    @pytest.mark.asyncio
    async def test_delete_workspace(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "wsdel@test.dev", "wsdeluser")
        create_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "Deletable WS"},
            headers=headers,
        )
        ws_id = create_res.json()["id"]
        res = await client.delete(
            f"/api/v1/workspaces/{ws_id}",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 204

    @pytest.mark.asyncio
    async def test_cannot_delete_personal_workspace(self, client: AsyncClient):
        headers, user = await auth_headers(client, "wsnodel@test.dev", "wsnodeluser")
        ws_id = user["default_workspace_id"]
        res = await client.delete(
            f"/api/v1/workspaces/{ws_id}",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_set_default_workspace(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "wsdef@test.dev", "wsdefuser")
        create_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "Default WS"},
            headers=headers,
        )
        ws_id = create_res.json()["id"]
        res = await client.post(
            f"/api/v1/workspaces/{ws_id}/set-default",
            headers=headers,
        )
        assert res.status_code == 200

    @pytest.mark.asyncio
    async def test_non_member_cannot_access_workspace(self, client: AsyncClient):
        headers_a, _ = await auth_headers(client, "wsa@test.dev", "wsauser")
        headers_b, _ = await auth_headers(client, "wsb@test.dev", "wsbuser")
        create_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "Private WS"},
            headers=headers_a,
        )
        ws_id = create_res.json()["id"]
        res = await client.get(f"/api/v1/workspaces/{ws_id}", headers=headers_b)
        assert res.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
#  WORKSPACE MEMBERS
# ══════════════════════════════════════════════════════════════════════════════

class TestWorkspaceMembers:
    @pytest.mark.asyncio
    async def test_add_member(self, client: AsyncClient):
        headers_a, _ = await auth_headers(client, "wma@test.dev", "wmauser")
        headers_b, user_b = await auth_headers(client, "wmb@test.dev", "wmbuser")
        create_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "Member WS"},
            headers=headers_a,
        )
        ws_id = create_res.json()["id"]
        res = await client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"user_id": user_b["id"], "role": "editor"},
            headers={**headers_a, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 201

    @pytest.mark.asyncio
    async def test_list_members(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "wmlm@test.dev", "wmlmuser")
        create_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "ListM WS"},
            headers=headers,
        )
        ws_id = create_res.json()["id"]
        res = await client.get(
            f"/api/v1/workspaces/{ws_id}/members",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        assert len(res.json()) >= 1


# ══════════════════════════════════════════════════════════════════════════════
#  RBAC ENFORCEMENT
# ══════════════════════════════════════════════════════════════════════════════

class TestRBAC:
    @pytest.mark.asyncio
    async def test_viewer_cannot_add_members(self, client: AsyncClient):
        """Viewers should not be able to add workspace members."""
        headers_admin, _ = await auth_headers(client, "rbac_admin@test.dev", "rbacadmin")
        headers_viewer, user_v = await auth_headers(client, "rbac_viewer@test.dev", "rbacviewer")
        headers_other, user_o = await auth_headers(client, "rbac_other@test.dev", "rbacother")

        # Create workspace
        create_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "RBAC WS"},
            headers=headers_admin,
        )
        ws_id = create_res.json()["id"]

        # Add viewer
        await client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"user_id": user_v["id"], "role": "viewer"},
            headers={**headers_admin, "X-Workspace-Id": ws_id},
        )

        # Viewer tries to add another member — should fail
        res = await client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"user_id": user_o["id"], "role": "editor"},
            headers={**headers_viewer, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_editor_cannot_delete_workspace(self, client: AsyncClient):
        """Editors should not be able to delete workspaces."""
        headers_admin, _ = await auth_headers(client, "rbac_del_admin@test.dev", "rbacdeladmin")
        headers_editor, user_e = await auth_headers(client, "rbac_del_editor@test.dev", "rbacdeleditor")

        create_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "RBAC Del WS"},
            headers=headers_admin,
        )
        ws_id = create_res.json()["id"]

        await client.post(
            f"/api/v1/workspaces/{ws_id}/members",
            json={"user_id": user_e["id"], "role": "editor"},
            headers={**headers_admin, "X-Workspace-Id": ws_id},
        )

        res = await client.delete(
            f"/api/v1/workspaces/{ws_id}",
            headers={**headers_editor, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
#  WORKSPACE-SCOPED COLLECTIONS
# ══════════════════════════════════════════════════════════════════════════════

class TestWorkspaceScopedCollections:
    @pytest.mark.asyncio
    async def test_collection_created_with_workspace_id(self, client: AsyncClient):
        """Collections should be scoped to workspace when X-Workspace-Id header is sent."""
        headers, user = await auth_headers(client, "wscol@test.dev", "wscoluser")
        ws_id = user["default_workspace_id"]

        res = await client.post(
            "/api/v1/collections",
            json={"name": "WS Collection"},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 201

        # List should return collection when using same workspace
        res = await client.get(
            "/api/v1/collections",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        assert any(c["name"] == "WS Collection" for c in res.json())

    @pytest.mark.asyncio
    async def test_collections_isolated_between_workspaces(self, client: AsyncClient):
        """Collections in one workspace should not appear in another."""
        headers, user = await auth_headers(client, "wsiso@test.dev", "wsisouser")
        ws1_id = user["default_workspace_id"]

        # Create second workspace
        ws2_res = await client.post(
            "/api/v1/workspaces",
            json={"name": "WS2"},
            headers=headers,
        )
        ws2_id = ws2_res.json()["id"]

        # Create collection in WS1
        await client.post(
            "/api/v1/collections",
            json={"name": "WS1 Only"},
            headers={**headers, "X-Workspace-Id": ws1_id},
        )

        # Should NOT see it from WS2
        res = await client.get(
            "/api/v1/collections",
            headers={**headers, "X-Workspace-Id": ws2_id},
        )
        assert res.status_code == 200
        assert not any(c["name"] == "WS1 Only" for c in res.json())


# ══════════════════════════════════════════════════════════════════════════════
#  WORKSPACE-SCOPED ENVIRONMENTS
# ══════════════════════════════════════════════════════════════════════════════

class TestWorkspaceScopedEnvironments:
    @pytest.mark.asyncio
    async def test_environment_with_workspace(self, client: AsyncClient):
        headers, user = await auth_headers(client, "wsenv@test.dev", "wsenvuser")
        ws_id = user["default_workspace_id"]

        res = await client.post(
            "/api/v1/environments",
            json={"name": "Dev Env", "variables": {"API_URL": "http://dev"}},
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 201

        res = await client.get(
            "/api/v1/environments",
            headers={**headers, "X-Workspace-Id": ws_id},
        )
        assert res.status_code == 200
        assert any(e["name"] == "Dev Env" for e in res.json())


# ══════════════════════════════════════════════════════════════════════════════
#  INVITATIONS
# ══════════════════════════════════════════════════════════════════════════════

class TestInvitations:
    @pytest.mark.asyncio
    async def test_send_invitation(self, client: AsyncClient):
        headers, user = await auth_headers(client, "inv_send@test.dev", "invsenduser")
        ws_id = user["default_workspace_id"]

        res = await client.post(
            "/api/v1/invitations",
            json={
                "email": "newguy@test.dev",
                "workspace_id": ws_id,
                "role": "editor",
            },
            headers=headers,
        )
        assert res.status_code == 201
        data = res.json()
        assert data["email"] == "newguy@test.dev"
        assert data["status"] == "pending"
        assert "token" in data

    @pytest.mark.asyncio
    async def test_accept_invitation(self, client: AsyncClient):
        # Admin creates workspace and sends invite
        headers_admin, admin_user = await auth_headers(client, "inv_admin@test.dev", "invadminuser")
        ws_id = admin_user["default_workspace_id"]

        invite_res = await client.post(
            "/api/v1/invitations",
            json={
                "email": "inv_acceptee@test.dev",
                "workspace_id": ws_id,
                "role": "editor",
            },
            headers=headers_admin,
        )
        invite_token = invite_res.json()["token"]

        # Invited user registers and accepts
        headers_user, _ = await auth_headers(client, "inv_acceptee@test.dev", "invacceptee")
        res = await client.post(
            f"/api/v1/invitations/{invite_token}/respond",
            json={"action": "accept"},
            headers=headers_user,
        )
        assert res.status_code == 200
        assert res.json()["detail"] == "Invitation accepted"

        # User should now see the workspace
        ws_res = await client.get("/api/v1/workspaces", headers=headers_user)
        ws_ids = [w["id"] for w in ws_res.json()]
        assert ws_id in ws_ids

    @pytest.mark.asyncio
    async def test_decline_invitation(self, client: AsyncClient):
        headers_admin, admin_user = await auth_headers(client, "inv_dec_admin@test.dev", "invdecadmin")
        ws_id = admin_user["default_workspace_id"]

        invite_res = await client.post(
            "/api/v1/invitations",
            json={
                "email": "inv_decliner@test.dev",
                "workspace_id": ws_id,
                "role": "viewer",
            },
            headers=headers_admin,
        )
        invite_token = invite_res.json()["token"]

        headers_user, _ = await auth_headers(client, "inv_decliner@test.dev", "invdecliner")
        res = await client.post(
            f"/api/v1/invitations/{invite_token}/respond",
            json={"action": "decline"},
            headers=headers_user,
        )
        assert res.status_code == 200
        assert res.json()["detail"] == "Invitation declined"

    @pytest.mark.asyncio
    async def test_revoke_invitation(self, client: AsyncClient):
        headers, user = await auth_headers(client, "inv_revoke@test.dev", "invrevokeuser")
        ws_id = user["default_workspace_id"]

        invite_res = await client.post(
            "/api/v1/invitations",
            json={
                "email": "tobe_revoked@test.dev",
                "workspace_id": ws_id,
                "role": "editor",
            },
            headers=headers,
        )
        invite_id = invite_res.json()["id"]

        res = await client.delete(
            f"/api/v1/invitations/{invite_id}",
            headers=headers,
        )
        assert res.status_code == 204

    @pytest.mark.asyncio
    async def test_duplicate_invitation_rejected(self, client: AsyncClient):
        headers, user = await auth_headers(client, "inv_dup@test.dev", "invdupuser")
        ws_id = user["default_workspace_id"]

        await client.post(
            "/api/v1/invitations",
            json={"email": "dup_target@test.dev", "workspace_id": ws_id, "role": "editor"},
            headers=headers,
        )
        res = await client.post(
            "/api/v1/invitations",
            json={"email": "dup_target@test.dev", "workspace_id": ws_id, "role": "editor"},
            headers=headers,
        )
        assert res.status_code == 409

    @pytest.mark.asyncio
    async def test_list_pending_invitations(self, client: AsyncClient):
        headers_admin, admin_user = await auth_headers(client, "inv_list_admin@test.dev", "invlistadmin")
        ws_id = admin_user["default_workspace_id"]

        await client.post(
            "/api/v1/invitations",
            json={"email": "pending_user@test.dev", "workspace_id": ws_id, "role": "editor"},
            headers=headers_admin,
        )

        # Check pending from invitee's perspective
        headers_user, _ = await auth_headers(client, "pending_user@test.dev", "pendinguser")
        res = await client.get("/api/v1/invitations/pending", headers=headers_user)
        assert res.status_code == 200
        assert len(res.json()) >= 1


# ══════════════════════════════════════════════════════════════════════════════
#  BACKWARD COMPATIBILITY
# ══════════════════════════════════════════════════════════════════════════════

class TestBackwardCompatibility:
    @pytest.mark.asyncio
    async def test_collections_without_workspace_header(self, client: AsyncClient):
        """Collections should still work without X-Workspace-Id (owner_id fallback)."""
        headers, _ = await auth_headers(client, "compat@test.dev", "compatuser")

        res = await client.post(
            "/api/v1/collections",
            json={"name": "No WS Collection"},
            headers=headers,
        )
        assert res.status_code == 201

        res = await client.get("/api/v1/collections", headers=headers)
        assert res.status_code == 200
        assert any(c["name"] == "No WS Collection" for c in res.json())

    @pytest.mark.asyncio
    async def test_environments_without_workspace_header(self, client: AsyncClient):
        """Environments should still work without X-Workspace-Id."""
        headers, _ = await auth_headers(client, "envcompat@test.dev", "envcompatuser")

        res = await client.post(
            "/api/v1/environments",
            json={"name": "Compat Env", "variables": {}},
            headers=headers,
        )
        assert res.status_code == 201

        res = await client.get("/api/v1/environments", headers=headers)
        assert res.status_code == 200
        assert any(e["name"] == "Compat Env" for e in res.json())
