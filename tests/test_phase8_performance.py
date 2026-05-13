"""
Phase 8 Performance & Polish — Backend tests.

Tests for:
  - httpx connection pooling (lazy init, reuse, close)
  - Report template extraction (file-based loading, caching)
"""

import asyncio
from pathlib import Path
from unittest.mock import patch

import pytest

# ── httpx connection pooling ─────────────────────────────────────────────────


class TestConnectionPooling:
    """Verify the persistent AsyncClient lifecycle in APIRunner."""

    def _make_runner(self):
        from src.runner import APIRunner

        return APIRunner()

    def test_async_client_initially_none(self):
        """The async client should not be created until first use."""
        runner = self._make_runner()
        assert runner._async_client is None
        runner.close()

    def test_get_async_client_creates_client(self):
        """_get_async_client lazily creates a pooled httpx.AsyncClient."""
        import httpx

        runner = self._make_runner()
        client = runner._get_async_client()
        assert client is not None
        assert isinstance(client, httpx.AsyncClient)
        assert not client.is_closed
        # Cleanup
        asyncio.get_event_loop().run_until_complete(runner.close_async())

    def test_get_async_client_returns_same_instance(self):
        """Subsequent calls should return the same client (connection reuse)."""
        runner = self._make_runner()
        c1 = runner._get_async_client()
        c2 = runner._get_async_client()
        assert c1 is c2
        asyncio.get_event_loop().run_until_complete(runner.close_async())

    def test_get_async_client_recreates_if_closed(self):
        """If the client is closed, a fresh one should be created."""
        runner = self._make_runner()
        c1 = runner._get_async_client()
        asyncio.get_event_loop().run_until_complete(c1.aclose())
        assert c1.is_closed
        c2 = runner._get_async_client()
        assert c2 is not c1
        assert not c2.is_closed
        asyncio.get_event_loop().run_until_complete(runner.close_async())

    @pytest.mark.asyncio
    async def test_close_async_closes_client(self):
        """close_async should close the client and reset the reference."""
        runner = self._make_runner()
        client = runner._get_async_client()
        assert not client.is_closed
        await runner.close_async()
        assert client.is_closed
        assert runner._async_client is None

    @pytest.mark.asyncio
    async def test_close_async_idempotent(self):
        """Calling close_async twice should not raise."""
        runner = self._make_runner()
        runner._get_async_client()
        await runner.close_async()
        await runner.close_async()  # Should not raise

    def test_pool_limits_configured(self):
        """Verify the pool has expected limits via the client's pool_limits."""
        import httpx

        runner = self._make_runner()
        client = runner._get_async_client()
        # Access the transport layer to verify pool limits
        transport = client._transport
        assert isinstance(transport, httpx.AsyncHTTPTransport)
        pool = transport._pool
        # httpcore pool stores limits
        assert pool._max_connections == 100
        assert pool._max_keepalive_connections == 20
        asyncio.get_event_loop().run_until_complete(runner.close_async())

    def test_sync_close_does_not_affect_async(self):
        """close() should only close the sync session, not the async client."""
        runner = self._make_runner()
        client = runner._get_async_client()
        runner.close()
        assert not client.is_closed  # async client untouched
        asyncio.get_event_loop().run_until_complete(runner.close_async())


# ── Report template extraction ───────────────────────────────────────────────


class TestReportTemplateExtraction:
    """Verify report.html is loaded from file and cached."""

    def test_template_file_exists(self):
        """The extracted template file must exist on disk."""
        template_path = Path(__file__).parent.parent / "src" / "templates" / "report.html"
        assert template_path.exists(), f"Template not found: {template_path}"

    def test_template_contains_jinja_variables(self):
        """Template should contain the Jinja2 variables used by the renderer."""
        template_path = Path(__file__).parent.parent / "src" / "templates" / "report.html"
        content = template_path.read_text(encoding="utf-8")
        required_vars = [
            "{{ timestamp }}",
            "{{ summary.total_requests }}",
            "{{ summary.successful }}",
            "{{ summary.failed }}",
        ]
        for var in required_vars:
            assert var in content, f"Missing template variable: {var}"

    def test_template_is_valid_html(self):
        """Template should have proper HTML structure."""
        template_path = Path(__file__).parent.parent / "src" / "templates" / "report.html"
        content = template_path.read_text(encoding="utf-8")
        assert "<!DOCTYPE html>" in content
        assert "<html" in content
        assert "</html>" in content
        assert "<body>" in content
        assert "</body>" in content

    def test_get_html_template_returns_content(self):
        """_get_html_template() should return non-empty template string."""
        from src.report import _get_html_template

        content = _get_html_template()
        assert isinstance(content, str)
        assert len(content) > 1000  # Template is substantial

    def test_get_html_template_caches(self):
        """Second call should return the cached value without re-reading."""
        import src.report as report_module

        # Reset cache
        report_module._HTML_TEMPLATE_CACHE = ""

        first = report_module._get_html_template()
        assert report_module._HTML_TEMPLATE_CACHE == first

        # Patch read_text to verify it's not called again
        with patch.object(Path, "read_text", side_effect=RuntimeError("Should not read again")):
            second = report_module._get_html_template()
        assert second == first

    def test_report_generator_uses_file_template(self):
        """ReportGenerator._generate_html should use the file-based template."""
        from src.report import ReportGenerator
        from src.runner import RequestResult

        rg = ReportGenerator(output_dir="/tmp/api_watch_test_reports")
        result = RequestResult(
            success=True,
            status_code=200,
            response_time=0.123,
            response_body='{"ok": true}',
            response_headers={"content-type": "application/json"},
            response_size=12,
            request_method="GET",
            request_url="https://example.com/api",
        )
        files = rg.generate([result], test_suite_name="perf-test", format="html")
        assert "html" in files
        html_path = Path(files["html"])
        assert html_path.exists()
        content = html_path.read_text(encoding="utf-8")
        assert "API Test Report" in content
        assert "https://example.com/api" in content
        # Clean up
        html_path.unlink(missing_ok=True)

    def test_no_inline_html_template_constant(self):
        """Ensure there is no large HTML_TEMPLATE constant left in report.py."""
        import inspect

        import src.report as report_module

        source = inspect.getsource(report_module)
        assert "HTML_TEMPLATE = " not in source, "Leftover inline template found!"


# ── Report JSON generation (regression) ──────────────────────────────────────


class TestReportJSONRegression:
    """Ensure JSON report generation still works after template extraction."""

    def test_json_report_generated(self):
        from src.report import ReportGenerator
        from src.runner import RequestResult

        rg = ReportGenerator(output_dir="/tmp/api_watch_test_reports")
        result = RequestResult(
            success=False,
            status_code=500,
            response_time=2.5,
            response_body="Internal Server Error",
            response_headers={},
            response_size=21,
            request_method="POST",
            request_url="https://example.com/api/data",
            error="Server error",
            error_type="server_error",
        )
        files = rg.generate([result], format="json")
        assert "json" in files
        import json

        json_path = Path(files["json"])
        data = json.loads(json_path.read_text(encoding="utf-8"))
        assert data["summary"]["failed"] == 1
        assert data["results"][0]["method"] == "POST"
        json_path.unlink(missing_ok=True)
