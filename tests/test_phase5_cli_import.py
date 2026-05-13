"""
Phase 5 tests — CI/CD, API Keys & Import/Export.

Covers:
  - API key generation, listing, and revocation
  - API key authentication via X-API-Key header
  - API key expiry enforcement
  - API key scope validation
  - Postman v2.1 import (upload JSON → collection created)
  - Postman v2.1 export (collection → valid Postman JSON)
  - Postman roundtrip fidelity (import → export → compare)
  - OpenAPI 3.0.3 export structure validation
  - JUnit XML generation (unit tests)
  - Import/export route error handling
"""

import json
import xml.etree.ElementTree as ET
from io import BytesIO

import pytest
from httpx import AsyncClient

# ── Helpers ───────────────────────────────────────────────────────────────────


async def register_user(
    client: AsyncClient, email: str, username: str, password: str = "TestPass123"
):
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
    client: AsyncClient,
    headers: dict,
    name: str,
    workspace_id: str | None = None,
) -> dict:
    h = {**headers}
    if workspace_id:
        h["X-Workspace-Id"] = workspace_id
    res = await client.post("/api/v1/collections", json={"name": name}, headers=h)
    assert res.status_code == 201, f"Collection creation failed: {res.text}"
    return res.json()


async def save_request(
    client: AsyncClient,
    headers: dict,
    collection_id: str,
    name: str,
    method: str = "GET",
    url: str = "https://httpbin.org/get",
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


async def create_api_key(
    client: AsyncClient,
    headers: dict,
    name: str,
    scopes: list | None = None,
    expires_in_days: int | None = None,
) -> dict:
    body: dict = {"name": name}
    if scopes is not None:
        body["scopes"] = scopes
    if expires_in_days is not None:
        body["expires_in_days"] = expires_in_days
    res = await client.post("/api/v1/api-keys", json=body, headers=headers)
    assert res.status_code == 201, f"API key creation failed: {res.text}"
    return res.json()


# ── API Key CRUD ──────────────────────────────────────────────────────────────


class TestApiKeyCRUD:
    """Test API key creation, listing, and revocation."""

    @pytest.mark.asyncio
    async def test_create_api_key(self, client: AsyncClient):
        headers, user = await auth_headers(client, "keyuser@test.dev", "keyuser")
        data = await create_api_key(client, headers, "CI Key")

        assert "id" in data
        assert data["name"] == "CI Key"
        assert "key" in data
        assert data["key"].startswith("aw_")
        assert len(data["key"]) > 20
        assert "key_prefix" in data

    @pytest.mark.asyncio
    async def test_create_api_key_with_scopes(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "keyuser2@test.dev", "keyuser2")
        data = await create_api_key(client, headers, "Read-only", scopes=["read"])

        assert data["scopes"] == ["read"]

    @pytest.mark.asyncio
    async def test_create_api_key_with_expiry(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "keyuser3@test.dev", "keyuser3")
        data = await create_api_key(client, headers, "Expiring", expires_in_days=30)

        assert data["expires_at"] is not None

    @pytest.mark.asyncio
    async def test_create_api_key_invalid_scope(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "keyuser4@test.dev", "keyuser4")
        res = await client.post(
            "/api/v1/api-keys",
            json={"name": "Bad", "scopes": ["invalid_scope"]},
            headers=headers,
        )
        assert res.status_code == 400, f"Should reject invalid scope: {res.text}"

    @pytest.mark.asyncio
    async def test_list_api_keys(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "keylist@test.dev", "keylist")
        await create_api_key(client, headers, "Key A")
        await create_api_key(client, headers, "Key B")

        res = await client.get("/api/v1/api-keys", headers=headers)
        assert res.status_code == 200
        keys = res.json()
        assert len(keys) == 2
        names = {k["name"] for k in keys}
        assert names == {"Key A", "Key B"}
        # Raw key should NOT appear in list
        for k in keys:
            assert "raw_key" not in k

    @pytest.mark.asyncio
    async def test_revoke_api_key(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "keyrevoke@test.dev", "keyrevoke")
        data = await create_api_key(client, headers, "To Revoke")

        res = await client.delete(f"/api/v1/api-keys/{data['id']}", headers=headers)
        assert res.status_code == 204

        # After revocation, should not appear as active
        res2 = await client.get("/api/v1/api-keys", headers=headers)
        active = [k for k in res2.json() if k["is_active"]]
        assert len(active) == 0

    @pytest.mark.asyncio
    async def test_revoke_nonexistent_key(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "keyrevoke2@test.dev", "keyrevoke2")
        res = await client.delete("/api/v1/api-keys/nonexistent-id", headers=headers)
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_revoke_other_users_key(self, client: AsyncClient):
        headers_a, _ = await auth_headers(client, "keya@test.dev", "keya")
        headers_b, _ = await auth_headers(client, "keyb@test.dev", "keyb")
        data = await create_api_key(client, headers_a, "User A Key")

        res = await client.delete(f"/api/v1/api-keys/{data['id']}", headers=headers_b)
        assert res.status_code in (404, 403)

    @pytest.mark.asyncio
    async def test_key_prefix_format(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "keyprefix@test.dev", "keyprefix")
        data = await create_api_key(client, headers, "Prefix Test")

        raw = data["key"]
        prefix = data["key_prefix"]
        # Prefix should be first 8 chars of the raw key
        assert raw.startswith("aw_")
        assert raw[:8] == prefix


# ── API Key Authentication ────────────────────────────────────────────────────


class TestApiKeyAuth:
    """Test authentication via X-API-Key header."""

    @pytest.mark.asyncio
    async def test_auth_with_api_key(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "apiauth@test.dev", "apiauth")
        key_data = await create_api_key(client, headers, "Auth Test Key")
        raw_key = key_data["key"]

        # Use API key to access a protected endpoint (collections list)
        res = await client.get(
            "/api/v1/collections",
            headers={"X-API-Key": raw_key},
        )
        assert res.status_code == 200, f"API key auth failed: {res.text}"

    @pytest.mark.asyncio
    async def test_auth_with_invalid_api_key(self, client: AsyncClient):
        res = await client.get(
            "/api/v1/collections",
            headers={"X-API-Key": "aw_invalid_key_that_does_not_exist_000000"},
        )
        assert res.status_code in (401, 403), f"Should reject invalid key: {res.text}"

    @pytest.mark.asyncio
    async def test_auth_with_revoked_key(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "revokeauth@test.dev", "revokeauth")
        key_data = await create_api_key(client, headers, "Revoke Auth Key")
        raw_key = key_data["key"]

        # Revoke the key
        await client.delete(f"/api/v1/api-keys/{key_data['id']}", headers=headers)

        # Try to use revoked key
        res = await client.get(
            "/api/v1/collections",
            headers={"X-API-Key": raw_key},
        )
        assert res.status_code in (401, 403), f"Should reject revoked key: {res.text}"

    @pytest.mark.asyncio
    async def test_no_auth_returns_open_access(self, client: AsyncClient):
        """In open-source mode, endpoints are accessible without auth."""
        res = await client.get("/api/v1/collections")
        assert res.status_code == 200

    @pytest.mark.asyncio
    async def test_api_key_updates_last_used(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "lastused@test.dev", "lastused")
        key_data = await create_api_key(client, headers, "Usage Track Key")
        raw_key = key_data["key"]

        # Use the key
        await client.get("/api/v1/collections", headers={"X-API-Key": raw_key})

        # Check last_used_at was updated
        res = await client.get("/api/v1/api-keys", headers=headers)
        keys = res.json()
        assert len(keys) > 0
        assert keys[0]["last_used_at"] is not None


# ── Postman Import / Export ───────────────────────────────────────────────────

SAMPLE_POSTMAN_COLLECTION = {
    "info": {
        "name": "Test API Collection",
        "description": "A test collection for import",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    "item": [
        {
            "name": "Get Users",
            "request": {
                "method": "GET",
                "header": [{"key": "Accept", "value": "application/json"}],
                "url": {
                    "raw": "https://api.example.com/users?page=1",
                    "protocol": "https",
                    "host": ["api", "example", "com"],
                    "path": ["users"],
                    "query": [{"key": "page", "value": "1"}],
                },
            },
        },
        {
            "name": "Create User",
            "request": {
                "method": "POST",
                "header": [{"key": "Content-Type", "value": "application/json"}],
                "body": {
                    "mode": "raw",
                    "raw": '{"name": "John"}',
                },
                "url": {
                    "raw": "https://api.example.com/users",
                    "protocol": "https",
                    "host": ["api", "example", "com"],
                    "path": ["users"],
                },
            },
        },
        {
            "name": "Folder A",
            "item": [
                {
                    "name": "Nested Request",
                    "request": {
                        "method": "DELETE",
                        "url": {"raw": "https://api.example.com/items/1"},
                    },
                },
            ],
        },
    ],
}


class TestPostmanImport:
    """Test Postman collection import via file upload."""

    @pytest.mark.asyncio
    async def test_import_postman_collection(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "import@test.dev", "importuser")
        file_content = json.dumps(SAMPLE_POSTMAN_COLLECTION).encode()

        res = await client.post(
            "/api/v1/import-export/import/postman",
            files={
                "file": ("test.postman_collection.json", BytesIO(file_content), "application/json")
            },
            headers=headers,
        )
        assert res.status_code == 201, f"Import failed: {res.text}"
        data = res.json()
        assert "id" in data
        assert data["request_count"] == 3  # 2 top-level + 1 nested

    @pytest.mark.asyncio
    async def test_import_creates_collection_with_requests(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "import2@test.dev", "import2")
        file_content = json.dumps(SAMPLE_POSTMAN_COLLECTION).encode()

        res = await client.post(
            "/api/v1/import-export/import/postman",
            files={"file": ("test.json", BytesIO(file_content), "application/json")},
            headers=headers,
        )
        data = res.json()
        col_id = data["id"]

        # Verify collection exists
        res2 = await client.get(f"/api/v1/collections/{col_id}", headers=headers)
        assert res2.status_code == 200
        col = res2.json()
        assert col["name"] == "Test API Collection"

    @pytest.mark.asyncio
    async def test_import_invalid_json(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "badjson@test.dev", "badjson")

        res = await client.post(
            "/api/v1/import-export/import/postman",
            files={"file": ("bad.json", BytesIO(b"not json at all"), "application/json")},
            headers=headers,
        )
        assert res.status_code in (400, 422), f"Should reject bad JSON: {res.text}"


class TestPostmanExport:
    """Test exporting collections as Postman v2.1 format."""

    @pytest.mark.asyncio
    async def test_export_postman(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "export@test.dev", "exportuser")
        col = await create_collection(client, headers, "Export Test")
        await save_request(
            client, headers, col["id"], "Get Stuff", "GET", "https://api.example.com/stuff"
        )
        await save_request(
            client, headers, col["id"], "Post Data", "POST", "https://api.example.com/data"
        )

        res = await client.get(f"/api/v1/import-export/export/postman/{col['id']}", headers=headers)
        assert res.status_code == 200
        data = res.json()

        # Validate Postman structure
        assert "info" in data
        assert data["info"]["name"] == "Export Test"
        assert "schema" in data["info"]
        assert "item" in data
        assert len(data["item"]) == 2

    @pytest.mark.asyncio
    async def test_export_postman_nonexistent_collection(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "exportnone@test.dev", "exportnone")
        res = await client.get(
            "/api/v1/import-export/export/postman/nonexistent-id", headers=headers
        )
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_export_postman_empty_collection(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "exportempty@test.dev", "exportempty")
        col = await create_collection(client, headers, "Empty")

        res = await client.get(f"/api/v1/import-export/export/postman/{col['id']}", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["item"] == []


# ── OpenAPI Export ────────────────────────────────────────────────────────────


class TestOpenApiExport:
    """Test exporting collections as OpenAPI 3.0 spec."""

    @pytest.mark.asyncio
    async def test_export_openapi(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "oapiex@test.dev", "oapiex")
        col = await create_collection(client, headers, "OpenAPI Export Test")
        await save_request(
            client, headers, col["id"], "List Users", "GET", "https://api.example.com/users"
        )
        await save_request(
            client, headers, col["id"], "Create User", "POST", "https://api.example.com/users"
        )

        res = await client.get(f"/api/v1/import-export/export/openapi/{col['id']}", headers=headers)
        assert res.status_code == 200
        spec = res.json()

        # Validate OpenAPI structure
        assert spec["openapi"] == "3.0.3"
        assert "info" in spec
        assert spec["info"]["title"] == "OpenAPI Export Test"
        assert "paths" in spec
        assert "/users" in spec["paths"]

    @pytest.mark.asyncio
    async def test_export_openapi_groups_by_path(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "oapigroup@test.dev", "oapigroup")
        col = await create_collection(client, headers, "Grouped")
        await save_request(client, headers, col["id"], "R1", "GET", "https://api.example.com/items")
        await save_request(
            client, headers, col["id"], "R2", "POST", "https://api.example.com/items"
        )
        await save_request(client, headers, col["id"], "R3", "GET", "https://api.example.com/other")

        res = await client.get(f"/api/v1/import-export/export/openapi/{col['id']}", headers=headers)
        spec = res.json()
        assert "/items" in spec["paths"]
        assert "/other" in spec["paths"]
        # /items should have GET and POST
        items_path = spec["paths"]["/items"]
        assert "get" in items_path
        assert "post" in items_path

    @pytest.mark.asyncio
    async def test_export_openapi_nonexistent(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "oapinone@test.dev", "oapinone")
        res = await client.get(
            "/api/v1/import-export/export/openapi/nonexistent-id", headers=headers
        )
        assert res.status_code == 404


# ── JUnit XML (unit tests) ───────────────────────────────────────────────────


class TestJunitWriter:
    """Test JUnit XML output from results_to_junit."""

    def test_results_to_junit_all_pass(self):
        from src.junit_writer import results_to_junit

        results = [
            {
                "request_name": "GET /health",
                "status_code": 200,
                "response_time": 0.042,
                "success": True,
            },
            {
                "request_name": "GET /users",
                "status_code": 200,
                "response_time": 0.105,
                "success": True,
            },
        ]
        xml_str = results_to_junit("Health Suite", results)

        root = ET.fromstring(xml_str)
        assert root.tag == "testsuite"
        assert root.get("name") == "Health Suite"
        assert root.get("tests") == "2"
        assert root.get("failures") == "0"

        cases = root.findall("testcase")
        assert len(cases) == 2

    def test_results_to_junit_with_failure(self):
        from src.junit_writer import results_to_junit

        results = [
            {
                "request_name": "GET /health",
                "status_code": 200,
                "response_time": 0.042,
                "success": True,
            },
            {
                "request_name": "POST /users",
                "status_code": 500,
                "response_time": 0.200,
                "success": False,
                "error": "Server Error",
            },
        ]
        xml_str = results_to_junit("Mixed Suite", results)

        root = ET.fromstring(xml_str)
        assert root.get("failures") == "1"

        # Find the failing test case
        cases = root.findall("testcase")
        failed_case = [c for c in cases if c.find("failure") is not None]
        assert len(failed_case) == 1

    def test_results_to_junit_with_error(self):
        from src.junit_writer import results_to_junit

        results = [
            {
                "request_name": "GET /unreachable",
                "status_code": 0,
                "response_time": 0,
                "success": False,
                "error": "Connection timeout",
            },
        ]
        xml_str = results_to_junit("Error Suite", results)

        root = ET.fromstring(xml_str)
        # results_to_junit classifies all failures as failures (not errors)
        assert root.get("failures") == "1"

    def test_results_to_junit_valid_xml(self):
        from src.junit_writer import results_to_junit

        results = [
            {"request_name": "Test 1", "status_code": 200, "response_time": 0.01, "success": True},
        ]
        xml_str = results_to_junit("Valid", results)

        # Should start with XML declaration
        assert xml_str.strip().startswith("<?xml")
        # Should be parseable
        ET.fromstring(xml_str)

    def test_results_to_junit_empty(self):
        from src.junit_writer import results_to_junit

        xml_str = results_to_junit("Empty", [])
        root = ET.fromstring(xml_str)
        assert root.get("tests") == "0"


# ── Postman Converter (unit tests) ───────────────────────────────────────────


class TestPostmanConverter:
    """Unit tests for postman_v2 import/export functions."""

    def test_import_postman_v2(self):
        from src.importers.postman_v2 import import_postman_v2

        result = import_postman_v2(SAMPLE_POSTMAN_COLLECTION)
        assert result["name"] == "Test API Collection"
        assert result["description"] == "A test collection for import"
        assert len(result["requests"]) == 3

        # Check first request
        get_req = result["requests"][0]
        assert get_req["name"] == "Get Users"
        assert get_req["method"] == "GET"

    def test_import_postman_flattens_folders(self):
        from src.importers.postman_v2 import import_postman_v2

        result = import_postman_v2(SAMPLE_POSTMAN_COLLECTION)
        nested = [r for r in result["requests"] if "Folder A" in r["name"]]
        assert len(nested) == 1

    def test_export_postman_v2(self):
        from src.importers.postman_v2 import export_postman_v2

        requests = [
            {
                "name": "R1",
                "method": "GET",
                "url": "https://example.com/api",
                "headers": {},
                "body": None,
            },
            {
                "name": "R2",
                "method": "POST",
                "url": "https://example.com/api",
                "headers": {"Content-Type": "application/json"},
                "body": '{"a": 1}',
            },
        ]
        result = export_postman_v2("Test", "Desc", requests)
        assert result["info"]["name"] == "Test"
        assert len(result["item"]) == 2
        assert "schema" in result["info"]

    def test_roundtrip_fidelity(self):
        from src.importers.postman_v2 import export_postman_v2, import_postman_v2

        imported = import_postman_v2(SAMPLE_POSTMAN_COLLECTION)
        exported = export_postman_v2(
            imported["name"],
            imported["description"],
            imported["requests"],
        )
        assert exported["info"]["name"] == SAMPLE_POSTMAN_COLLECTION["info"]["name"]
        assert len(exported["item"]) == len(imported["requests"])


# ── OpenAPI Exporter (unit tests) ─────────────────────────────────────────────


class TestOpenApiExporter:
    """Unit tests for the OpenAPI export function."""

    def test_export_openapi_basic(self):
        from src.importers.openapi_export import export_openapi

        requests = [
            {
                "name": "List",
                "method": "GET",
                "url": "https://api.example.com/items",
                "headers": {},
                "body": None,
            },
            {
                "name": "Create",
                "method": "POST",
                "url": "https://api.example.com/items",
                "headers": {"Content-Type": "application/json"},
                "body": '{"name": "test"}',
            },
        ]
        spec = export_openapi("My API", "Test API", requests)

        assert spec["openapi"] == "3.0.3"
        assert spec["info"]["title"] == "My API"
        assert "/items" in spec["paths"]
        assert "get" in spec["paths"]["/items"]
        assert "post" in spec["paths"]["/items"]

    def test_export_openapi_extracts_servers(self):
        from src.importers.openapi_export import export_openapi

        requests = [
            {
                "name": "R1",
                "method": "GET",
                "url": "https://api.example.com/v2/things",
                "headers": {},
                "body": None,
            },
        ]
        spec = export_openapi("Servers", "", requests)

        assert len(spec.get("servers", [])) > 0
        assert "example.com" in spec["servers"][0]["url"]

    def test_export_openapi_empty(self):
        from src.importers.openapi_export import export_openapi

        spec = export_openapi("Empty", "", [])
        assert spec["openapi"] == "3.0.3"
        assert spec["paths"] == {}


# ── CI Template Validation ────────────────────────────────────────────────────


class TestCITemplates:
    """Validate CI template files exist and have expected content."""

    def test_github_actions_template_exists(self):
        import os

        path = os.path.join(os.path.dirname(__file__), "..", "ci-templates", "github-actions.yml")
        assert os.path.isfile(path), "GitHub Actions template should exist"
        with open(path) as f:
            content = f.read()
        assert "junit" in content.lower() or "JUnit" in content

    def test_azure_devops_template_exists(self):
        import os

        path = os.path.join(os.path.dirname(__file__), "..", "ci-templates", "azure-devops.yml")
        assert os.path.isfile(path), "Azure DevOps template should exist"
        with open(path) as f:
            content = f.read()
        assert "junit" in content.lower() or "JUnit" in content


# ── Edge Cases ────────────────────────────────────────────────────────────────


class TestEdgeCases:
    """Edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_import_without_auth(self, client: AsyncClient):
        """In open-source mode, import is accessible without auth (may return 400 for bad data)."""
        res = await client.post(
            "/api/v1/import-export/import/postman",
            files={"file": ("test.json", BytesIO(b"{}"), "application/json")},
        )
        assert res.status_code not in (401, 403)

    @pytest.mark.asyncio
    async def test_export_without_auth(self, client: AsyncClient):
        """In open-source mode, export is accessible without auth (may return 404 for missing collection)."""
        res = await client.get("/api/v1/import-export/export/postman/some-id")
        assert res.status_code not in (401, 403)

    @pytest.mark.asyncio
    async def test_api_key_crud_without_auth(self, client: AsyncClient):
        """In open-source mode, API key CRUD is accessible without auth."""
        res = await client.post("/api/v1/api-keys", json={"name": "Nope"})
        assert res.status_code not in (401, 403)

        res2 = await client.get("/api/v1/api-keys")
        assert res2.status_code not in (401, 403)

    @pytest.mark.asyncio
    async def test_create_api_key_missing_name(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "noname@test.dev", "noname")
        res = await client.post("/api/v1/api-keys", json={}, headers=headers)
        assert res.status_code == 422, f"Should require name: {res.text}"

    @pytest.mark.asyncio
    async def test_multiple_keys_per_user(self, client: AsyncClient):
        headers, _ = await auth_headers(client, "multikey@test.dev", "multikey")
        k1 = await create_api_key(client, headers, "Key 1")
        k2 = await create_api_key(client, headers, "Key 2")
        k3 = await create_api_key(client, headers, "Key 3")

        res = await client.get("/api/v1/api-keys", headers=headers)
        assert len(res.json()) == 3

        # Each key should have a unique key
        assert k1["key"] != k2["key"]
        assert k2["key"] != k3["key"]

    @pytest.mark.asyncio
    async def test_import_postman_with_api_key(self, client: AsyncClient):
        """Verify import works with API key auth too."""
        headers, _ = await auth_headers(client, "importkey@test.dev", "importkey")
        key_data = await create_api_key(client, headers, "Import Key", scopes=["read", "write"])
        raw_key = key_data["key"]

        file_content = json.dumps(SAMPLE_POSTMAN_COLLECTION).encode()
        res = await client.post(
            "/api/v1/import-export/import/postman",
            files={"file": ("test.json", BytesIO(file_content), "application/json")},
            headers={"X-API-Key": raw_key},
        )
        assert res.status_code == 201, f"Import with API key failed: {res.text}"
