"""
Phase 4 tests — Monitoring & Alerting.

Covers:
  - Monitor CRUD (create, list, get, update, delete)
  - Monitor run history
  - Notification channel CRUD (create, list, get, update, delete)
  - Notification channel validation
  - Monitor–channel linking
  - Assertion evaluator (unit tests)
  - Monitor executor (integration)
  - Manual trigger endpoint
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


async def create_collection(
    client: AsyncClient, headers: dict, name: str,
    workspace_id: Optional[str] = None,
) -> dict:
    h = {**headers}
    if workspace_id:
        h["X-Workspace-Id"] = workspace_id
    res = await client.post("/api/v1/collections", json={"name": name}, headers=h)
    assert res.status_code == 201, f"Collection creation failed: {res.text}"
    return res.json()


async def save_request(
    client: AsyncClient, headers: dict, collection_id: str, name: str,
    method: str = "GET", url: str = "https://httpbin.org/get",
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


async def create_monitor(
    client: AsyncClient, headers: dict, name: str, collection_id: str,
    workspace_id: Optional[str] = None, **kwargs,
) -> dict:
    h = {**headers}
    if workspace_id:
        h["X-Workspace-Id"] = workspace_id
    body = {
        "name": name,
        "collection_id": collection_id,
        "cron_expression": "*/5 * * * *",
        **kwargs,
    }
    res = await client.post("/api/v1/monitors", json=body, headers=h)
    assert res.status_code == 201, f"Monitor creation failed: {res.text}"
    return res.json()


async def create_channel(
    client: AsyncClient, headers: dict, name: str,
    channel_type: str = "webhook",
    config: Optional[dict] = None,
    workspace_id: Optional[str] = None,
) -> dict:
    h = {**headers}
    if workspace_id:
        h["X-Workspace-Id"] = workspace_id
    body = {
        "name": name,
        "channel_type": channel_type,
        "config": config or {"url": "https://hooks.example.com/test"},
    }
    res = await client.post("/api/v1/notifications", json=body, headers=h)
    assert res.status_code == 201, f"Channel creation failed: {res.text}"
    return res.json()


# ══════════════════════════════════════════════════════════════════════════════
#  MONITOR CRUD
# ══════════════════════════════════════════════════════════════════════════════

class TestMonitorCRUD:

    @pytest.mark.asyncio
    async def test_create_monitor(self, client: AsyncClient):
        headers, user = await auth_headers(client, "mon1@test.dev", "mon1")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Mon Col 1", ws)
        mon = await create_monitor(client, headers, "Health Check", col["id"], ws)
        assert mon["name"] == "Health Check"
        assert mon["enabled"] is True
        assert mon["cron_expression"] == "*/5 * * * *"
        assert mon["consecutive_failures"] == 0
        assert mon["last_status"] is None

    @pytest.mark.asyncio
    async def test_list_monitors(self, client: AsyncClient):
        headers, user = await auth_headers(client, "mon2@test.dev", "mon2")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Mon Col 2", ws)
        await create_monitor(client, headers, "Monitor A", col["id"], ws)
        await create_monitor(client, headers, "Monitor B", col["id"], ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.get("/api/v1/monitors", headers=h)
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2

    @pytest.mark.asyncio
    async def test_get_monitor(self, client: AsyncClient):
        headers, user = await auth_headers(client, "mon3@test.dev", "mon3")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Mon Col 3", ws)
        mon = await create_monitor(client, headers, "Monitor C", col["id"], ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.get(f"/api/v1/monitors/{mon['id']}", headers=h)
        assert res.status_code == 200
        assert res.json()["name"] == "Monitor C"

    @pytest.mark.asyncio
    async def test_update_monitor(self, client: AsyncClient):
        headers, user = await auth_headers(client, "mon4@test.dev", "mon4")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Mon Col 4", ws)
        mon = await create_monitor(client, headers, "Monitor D", col["id"], ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.put(
            f"/api/v1/monitors/{mon['id']}",
            json={"name": "Updated Monitor", "enabled": False, "alert_after_failures": 3},
            headers=h,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Updated Monitor"
        assert data["enabled"] is False
        assert data["alert_after_failures"] == 3

    @pytest.mark.asyncio
    async def test_delete_monitor(self, client: AsyncClient):
        headers, user = await auth_headers(client, "mon5@test.dev", "mon5")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Mon Col 5", ws)
        mon = await create_monitor(client, headers, "Monitor E", col["id"], ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.delete(f"/api/v1/monitors/{mon['id']}", headers=h)
        assert res.status_code == 204

        res = await client.get(f"/api/v1/monitors/{mon['id']}", headers=h)
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_create_monitor_invalid_collection(self, client: AsyncClient):
        headers, user = await auth_headers(client, "mon6@test.dev", "mon6")
        ws = user["default_workspace_id"]
        h = {**headers, "X-Workspace-Id": ws}
        res = await client.post("/api/v1/monitors", json={
            "name": "Bad Monitor",
            "collection_id": "nonexistent-id",
        }, headers=h)
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_monitor_with_assertions(self, client: AsyncClient):
        headers, user = await auth_headers(client, "mon7@test.dev", "mon7")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Mon Col 7", ws)
        mon = await create_monitor(client, headers, "Assert Monitor", col["id"], ws, assertions=[
            {"type": "status_code", "operator": "eq", "value": "200"},
            {"type": "response_time", "operator": "lt", "value": "5"},
        ])
        assert len(mon["assertions"]) == 2
        assert mon["assertions"][0]["type"] == "status_code"


# ══════════════════════════════════════════════════════════════════════════════
#  MONITOR RUN HISTORY
# ══════════════════════════════════════════════════════════════════════════════

class TestMonitorRunHistory:

    @pytest.mark.asyncio
    async def test_empty_runs(self, client: AsyncClient):
        headers, user = await auth_headers(client, "run1@test.dev", "run1")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Run Col 1", ws)
        mon = await create_monitor(client, headers, "Run Monitor 1", col["id"], ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.get(f"/api/v1/monitors/{mon['id']}/runs", headers=h)
        assert res.status_code == 200
        assert res.json() == []

    @pytest.mark.asyncio
    async def test_runs_404_for_bad_monitor(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "run2@test.dev", "run2")
        res = await client.get("/api/v1/monitors/nonexistent/runs", headers=headers)
        assert res.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION CHANNEL CRUD
# ══════════════════════════════════════════════════════════════════════════════

class TestNotificationChannelCRUD:

    @pytest.mark.asyncio
    async def test_create_webhook_channel(self, client: AsyncClient):
        headers, user = await auth_headers(client, "notif1@test.dev", "notif1")
        ws = user["default_workspace_id"]
        ch = await create_channel(client, headers, "My Webhook", "webhook",
                                  {"url": "https://hooks.example.com/test"}, ws)
        assert ch["name"] == "My Webhook"
        assert ch["channel_type"] == "webhook"
        assert ch["enabled"] is True

    @pytest.mark.asyncio
    async def test_create_email_channel(self, client: AsyncClient):
        headers, user = await auth_headers(client, "notif2@test.dev", "notif2")
        ws = user["default_workspace_id"]
        ch = await create_channel(client, headers, "Email Alerts", "email",
                                  {"recipients": ["admin@example.com"]}, ws)
        assert ch["channel_type"] == "email"
        assert "recipients" in ch["config"]

    @pytest.mark.asyncio
    async def test_create_slack_channel(self, client: AsyncClient):
        headers, user = await auth_headers(client, "notif3@test.dev", "notif3")
        ws = user["default_workspace_id"]
        ch = await create_channel(client, headers, "Slack Alerts", "slack",
                                  {"webhook_url": "https://hooks.slack.com/services/abc"}, ws)
        assert ch["channel_type"] == "slack"

    @pytest.mark.asyncio
    async def test_list_channels(self, client: AsyncClient):
        headers, user = await auth_headers(client, "notif4@test.dev", "notif4")
        ws = user["default_workspace_id"]
        await create_channel(client, headers, "Ch1", "webhook",
                             {"url": "https://a.com"}, ws)
        await create_channel(client, headers, "Ch2", "webhook",
                             {"url": "https://b.com"}, ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.get("/api/v1/notifications", headers=h)
        assert res.status_code == 200
        assert len(res.json()) == 2

    @pytest.mark.asyncio
    async def test_update_channel(self, client: AsyncClient):
        headers, user = await auth_headers(client, "notif5@test.dev", "notif5")
        ws = user["default_workspace_id"]
        ch = await create_channel(client, headers, "Update Me", "webhook",
                                  {"url": "https://old.com"}, ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.put(f"/api/v1/notifications/{ch['id']}",
                               json={"name": "Updated", "config": {"url": "https://new.com"}},
                               headers=h)
        assert res.status_code == 200
        assert res.json()["name"] == "Updated"

    @pytest.mark.asyncio
    async def test_delete_channel(self, client: AsyncClient):
        headers, user = await auth_headers(client, "notif6@test.dev", "notif6")
        ws = user["default_workspace_id"]
        ch = await create_channel(client, headers, "Delete Me", "webhook",
                                  {"url": "https://del.com"}, ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.delete(f"/api/v1/notifications/{ch['id']}", headers=h)
        assert res.status_code == 204

        res = await client.get(f"/api/v1/notifications/{ch['id']}", headers=h)
        assert res.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
#  CHANNEL VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

class TestChannelValidation:

    @pytest.mark.asyncio
    async def test_invalid_channel_type(self, client: AsyncClient):
        headers, user = await auth_headers(client, "val1@test.dev", "val1")
        ws = user["default_workspace_id"]
        h = {**headers, "X-Workspace-Id": ws}
        res = await client.post("/api/v1/notifications", json={
            "name": "Bad", "channel_type": "sms", "config": {},
        }, headers=h)
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_email_without_recipients(self, client: AsyncClient):
        headers, user = await auth_headers(client, "val2@test.dev", "val2")
        ws = user["default_workspace_id"]
        h = {**headers, "X-Workspace-Id": ws}
        res = await client.post("/api/v1/notifications", json={
            "name": "Bad Email", "channel_type": "email", "config": {},
        }, headers=h)
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_webhook_without_url(self, client: AsyncClient):
        headers, user = await auth_headers(client, "val3@test.dev", "val3")
        ws = user["default_workspace_id"]
        h = {**headers, "X-Workspace-Id": ws}
        res = await client.post("/api/v1/notifications", json={
            "name": "Bad Webhook", "channel_type": "webhook", "config": {},
        }, headers=h)
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_slack_without_webhook_url(self, client: AsyncClient):
        headers, user = await auth_headers(client, "val4@test.dev", "val4")
        ws = user["default_workspace_id"]
        h = {**headers, "X-Workspace-Id": ws}
        res = await client.post("/api/v1/notifications", json={
            "name": "Bad Slack", "channel_type": "slack", "config": {},
        }, headers=h)
        assert res.status_code == 400


# ══════════════════════════════════════════════════════════════════════════════
#  MONITOR ↔ CHANNEL LINKING
# ══════════════════════════════════════════════════════════════════════════════

class TestMonitorChannelLinking:

    @pytest.mark.asyncio
    async def test_create_monitor_with_channels(self, client: AsyncClient):
        headers, user = await auth_headers(client, "link1@test.dev", "link1")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Link Col", ws)
        ch = await create_channel(client, headers, "Link Channel", "webhook",
                                  {"url": "https://hooks.example.com/link"}, ws)
        mon = await create_monitor(client, headers, "Linked Monitor", col["id"], ws,
                                   channel_ids=[ch["id"]])
        assert ch["id"] in mon["channel_ids"]

    @pytest.mark.asyncio
    async def test_update_monitor_channels(self, client: AsyncClient):
        headers, user = await auth_headers(client, "link2@test.dev", "link2")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Link Col 2", ws)
        ch1 = await create_channel(client, headers, "Ch A", "webhook",
                                   {"url": "https://a.com"}, ws)
        ch2 = await create_channel(client, headers, "Ch B", "webhook",
                                   {"url": "https://b.com"}, ws)
        mon = await create_monitor(client, headers, "Link Mon 2", col["id"], ws,
                                   channel_ids=[ch1["id"]])

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.put(
            f"/api/v1/monitors/{mon['id']}",
            json={"channel_ids": [ch2["id"]]},
            headers=h,
        )
        assert res.status_code == 200
        data = res.json()
        assert ch1["id"] not in data["channel_ids"]
        assert ch2["id"] in data["channel_ids"]


# ══════════════════════════════════════════════════════════════════════════════
#  ASSERTION EVALUATOR (unit-level)
# ══════════════════════════════════════════════════════════════════════════════

class TestAssertionEvaluator:

    def test_status_code_eq_pass(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "status_code", "operator": "eq", "value": "200"},
            {"status_code": 200},
        )
        assert result["passed"] is True

    def test_status_code_eq_fail(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "status_code", "operator": "eq", "value": "200"},
            {"status_code": 500},
        )
        assert result["passed"] is False

    def test_status_code_lt(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "status_code", "operator": "lt", "value": "400"},
            {"status_code": 200},
        )
        assert result["passed"] is True

    def test_response_time_lt_pass(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "response_time", "operator": "lt", "value": "2"},
            {"response_time": 0.5},
        )
        assert result["passed"] is True

    def test_response_time_lt_fail(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "response_time", "operator": "lt", "value": "0.1"},
            {"response_time": 0.5},
        )
        assert result["passed"] is False

    def test_body_contains_pass(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "body_contains", "operator": "eq", "value": "success"},
            {"body": '{"status": "success"}'},
        )
        assert result["passed"] is True

    def test_body_contains_fail(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "body_contains", "operator": "eq", "value": "error"},
            {"body": '{"status": "success"}'},
        )
        assert result["passed"] is False

    def test_header_exists_pass(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "header_exists", "operator": "eq", "value": "content-type"},
            {"headers": {"Content-Type": "application/json"}},
        )
        assert result["passed"] is True

    def test_header_exists_fail(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "header_exists", "operator": "eq", "value": "x-custom"},
            {"headers": {"Content-Type": "application/json"}},
        )
        assert result["passed"] is False

    def test_unknown_assertion_type(self):
        from src.monitor_executor import evaluate_assertion
        result = evaluate_assertion(
            {"type": "unknown_type", "operator": "eq", "value": "foo"},
            {"status_code": 200},
        )
        assert result["passed"] is False


# ══════════════════════════════════════════════════════════════════════════════
#  MANUAL TRIGGER
# ══════════════════════════════════════════════════════════════════════════════

class TestManualTrigger:

    @pytest.mark.asyncio
    async def test_trigger_monitor(self, client: AsyncClient):
        headers, user = await auth_headers(client, "trig1@test.dev", "trig1")
        ws = user["default_workspace_id"]
        col = await create_collection(client, headers, "Trigger Col", ws)
        mon = await create_monitor(client, headers, "Trigger Monitor", col["id"], ws)

        h = {**headers, "X-Workspace-Id": ws}
        res = await client.post(f"/api/v1/monitors/{mon['id']}/trigger", headers=h)
        assert res.status_code == 202
        assert res.json()["monitor_id"] == mon["id"]

    @pytest.mark.asyncio
    async def test_trigger_nonexistent_monitor(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "trig2@test.dev", "trig2")
        res = await client.post("/api/v1/monitors/nonexistent/trigger", headers=headers)
        assert res.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
#  NOTIFIER (unit-level)
# ══════════════════════════════════════════════════════════════════════════════

class TestNotifier:

    @pytest.mark.asyncio
    async def test_email_log_mode(self):
        """Email notifier should succeed in log-only mode (no SMTP_HOST)."""
        import os
        os.environ.pop("SMTP_HOST", None)

        from src.notifier import _send_email
        from unittest.mock import MagicMock
        from src.models import ChannelType

        channel = MagicMock()
        channel.name = "Test Email"
        channel.channel_type = ChannelType.EMAIL
        channel.config = {"recipients": ["test@example.com"]}

        result = await _send_email(channel, "Test Subject", "Test message")
        assert result is True
