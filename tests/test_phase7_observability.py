"""
Phase 7 tests — Observability & Governance.

Covers:
  Telemetry:
  - MetricsCollector: record_request, get_summary, reset, error rate calc
  - MetricsCollector: P95 latency, slowest endpoints top-10
  - TraceStore: add, list_recent, search by path/duration/status, ring buffer eviction
  - Span: duration_ms property, to_dict serialization
  - telemetry_middleware: trace-id propagation, header injection, skip health/assets

  Secret Scanner:
  - AWS access key / secret key detection
  - GitHub token detection (ghp_, gho_, ghs_, ghu_)
  - Stripe key, Slack token, Google API key, JWT token detection
  - Basic auth / bearer token / connection string / generic password detection
  - Generic API key, internal IP:port detection
  - Mask function (_mask_match) behaviour
  - scan_text, scan_dict, scan_request, scan_environment
  - No false positives on clean data

  Governance:
  - GovernanceChecker: check_request — HTTPS requirement, auth required, content-type, etc.
  - GovernanceChecker: check_collection — collection name + child request scanning
  - GovernanceChecker: check_environment — UPPER_SNAKE_CASE naming
  - GovernanceChecker: enable/disable rules
  - GovernanceReport: score calculation
  - GovernanceRule: all 10 built-in rules exist

  AuditLog:
  - Model creation with all fields
  - AuditCategory enum values
"""

import time
import uuid

from src.governance import (
    BUILTIN_RULES,
    GovernanceChecker,
    GovernanceReport,
    RuleViolation,
)
from src.models import AuditCategory, AuditLog
from src.secret_scanner import (
    _PATTERNS,
    SecretFinding,
    _mask_match,
    get_patterns_summary,
    scan_dict,
    scan_environment,
    scan_request,
    scan_text,
)

# ── Import application modules ────────────────────────────────────────────────
from src.telemetry import (
    MetricsCollector,
    Span,
    TraceStore,
    get_metrics,
    get_traces,
    reset_telemetry,
)

# ══════════════════════════════════════════════════════════════════════════════
# Span
# ══════════════════════════════════════════════════════════════════════════════


class TestSpan:
    """Unit tests for the Span dataclass."""

    def test_span_duration_ms(self):
        s = Span(
            trace_id="t1",
            span_id="s1",
            name="GET /api/test",
            start_time=1000.0,
            end_time=1000.123,
            status_code=200,
        )
        assert abs(s.duration_ms - 123.0) < 0.5

    def test_span_duration_ms_none_end(self):
        s = Span(
            trace_id="t1",
            span_id="s1",
            name="GET /api/test",
            start_time=1000.0,
            end_time=None,
            status_code=200,
        )
        assert s.duration_ms == 0.0

    def test_span_to_dict(self):
        s = Span(
            trace_id="t1",
            span_id="s1",
            name="GET /api",
            start_time=1.0,
            end_time=2.0,
            status_code=200,
            attributes={"key": "value"},
        )
        d = s.to_dict()
        assert d["trace_id"] == "t1"
        assert d["name"] == "GET /api"
        assert d["status_code"] == 200
        assert d["attributes"] == {"key": "value"}
        assert "duration_ms" in d

    def test_span_default_attributes(self):
        s = Span(
            trace_id="t1",
            span_id="s1",
            name="test",
            start_time=0.0,
            end_time=0.0,
            status_code=200,
        )
        assert s.attributes == {}


# ══════════════════════════════════════════════════════════════════════════════
# MetricsCollector
# ══════════════════════════════════════════════════════════════════════════════


class TestMetricsCollector:
    """Unit tests for MetricsCollector."""

    def test_record_and_summary(self):
        mc = MetricsCollector()
        mc.record_request("GET", "/api/users", 200, 50.0)
        mc.record_request("POST", "/api/users", 201, 100.0)
        mc.record_request("GET", "/api/users", 500, 200.0)

        summary = mc.get_summary()
        assert summary["total_requests"] == 3
        assert summary["total_errors"] == 1
        assert summary["status_codes"][200] == 1
        assert summary["status_codes"][201] == 1
        assert summary["status_codes"][500] == 1
        assert summary["methods"]["GET"] == 2
        assert summary["methods"]["POST"] == 1

    def test_error_rate(self):
        mc = MetricsCollector()
        mc.record_request("GET", "/a", 200, 10.0)
        mc.record_request("GET", "/b", 500, 10.0)
        mc.record_request("GET", "/c", 503, 10.0)
        mc.record_request("GET", "/d", 200, 10.0)
        summary = mc.get_summary()
        assert abs(summary["error_rate"] - 50.0) < 0.1

    def test_avg_latency(self):
        mc = MetricsCollector()
        mc.record_request("GET", "/a", 200, 100.0)
        mc.record_request("GET", "/b", 200, 200.0)
        summary = mc.get_summary()
        assert abs(summary["avg_latency_ms"] - 150.0) < 0.5

    def test_slowest_endpoints(self):
        mc = MetricsCollector()
        for i in range(15):
            mc.record_request("GET", f"/ep/{i}", 200, float(i * 100))
        summary = mc.get_summary()
        slowest = summary["slowest_endpoints"]
        assert len(slowest) <= 10
        # The first should be the slowest
        assert slowest[0]["p95_ms"] >= slowest[-1]["p95_ms"]

    def test_reset(self):
        mc = MetricsCollector()
        mc.record_request("GET", "/a", 200, 50.0)
        mc.reset()
        summary = mc.get_summary()
        assert summary["total_requests"] == 0
        assert summary["total_errors"] == 0

    def test_empty_summary(self):
        mc = MetricsCollector()
        summary = mc.get_summary()
        assert summary["total_requests"] == 0
        assert summary["error_rate"] == 0
        assert summary["avg_latency_ms"] == 0
        assert summary["slowest_endpoints"] == []

    def test_uptime_increases(self):
        mc = MetricsCollector()
        s1 = mc.get_summary()
        time.sleep(0.05)
        s2 = mc.get_summary()
        assert s2["uptime_seconds"] >= s1["uptime_seconds"]

    def test_4xx_not_counted_as_error(self):
        mc = MetricsCollector()
        mc.record_request("GET", "/a", 404, 10.0)
        mc.record_request("GET", "/b", 400, 10.0)
        assert mc.error_count == 0
        assert mc.request_count == 2

    def test_5xx_counted_as_error(self):
        mc = MetricsCollector()
        mc.record_request("GET", "/a", 500, 10.0)
        mc.record_request("GET", "/a", 502, 10.0)
        mc.record_request("GET", "/a", 503, 10.0)
        assert mc.error_count == 3


# ══════════════════════════════════════════════════════════════════════════════
# TraceStore
# ══════════════════════════════════════════════════════════════════════════════


class TestTraceStore:
    """Unit tests for TraceStore ring buffer."""

    def _make_span(
        self,
        name: str = "GET /test",
        status: int = 200,
        duration: float = 50.0,
        path: str = "/test",
    ) -> Span:
        t = time.time()
        return Span(
            trace_id=str(uuid.uuid4()),
            span_id=str(uuid.uuid4()),
            name=name,
            start_time=t,
            end_time=t + duration / 1000.0,
            status_code=status,
            attributes={"path": path, "method": name.split()[0] if " " in name else "GET"},
        )

    def test_add_and_list(self):
        ts = TraceStore(max_size=10)
        s1 = self._make_span("GET /api/users", path="/api/users")
        s2 = self._make_span("POST /api/users", path="/api/users")
        ts.add(s1)
        ts.add(s2)
        recent = ts.list_recent(10)
        assert len(recent) == 2
        # Most recent first — returns dicts
        assert recent[0]["name"] == "POST /api/users"

    def test_ring_buffer_eviction(self):
        ts = TraceStore(max_size=5)
        for i in range(10):
            ts.add(self._make_span(f"GET /ep/{i}", path=f"/ep/{i}"))
        assert ts.count == 5
        recent = ts.list_recent(10)
        assert len(recent) == 5
        # Should have the last 5 (ep/5 through ep/9)
        names = {s["name"] for s in recent}
        assert "GET /ep/9" in names
        assert "GET /ep/0" not in names

    def test_search_by_path(self):
        ts = TraceStore(max_size=100)
        ts.add(self._make_span("GET /api/users", path="/api/users"))
        ts.add(self._make_span("POST /api/collections", path="/api/collections"))
        ts.add(self._make_span("GET /api/users/123", path="/api/users/123"))
        results = ts.search(path="/api/users")
        assert len(results) == 2

    def test_search_by_status(self):
        ts = TraceStore(max_size=100)
        ts.add(self._make_span("GET /a", status=200, path="/a"))
        ts.add(self._make_span("GET /b", status=500, path="/b"))
        ts.add(self._make_span("GET /c", status=200, path="/c"))
        results = ts.search(status_code=500)
        assert len(results) == 1
        assert results[0]["status_code"] == 500

    def test_search_by_min_duration(self):
        ts = TraceStore(max_size=100)
        ts.add(self._make_span("GET /fast", duration=10.0, path="/fast"))
        ts.add(self._make_span("GET /slow", duration=500.0, path="/slow"))
        ts.add(self._make_span("GET /medium", duration=100.0, path="/medium"))
        results = ts.search(min_duration_ms=99.0)
        assert len(results) == 2

    def test_clear(self):
        ts = TraceStore(max_size=100)
        ts.add(self._make_span())
        ts.add(self._make_span())
        ts.clear()
        assert ts.count == 0

    def test_search_combined_filters(self):
        ts = TraceStore(max_size=100)
        ts.add(self._make_span("GET /api/users", status=200, duration=10.0, path="/api/users"))
        ts.add(self._make_span("GET /api/users", status=500, duration=200.0, path="/api/users"))
        ts.add(self._make_span("POST /api/other", status=500, duration=300.0, path="/api/other"))
        results = ts.search(path="/api/users", status_code=500)
        assert len(results) == 1

    def test_list_recent_limit(self):
        ts = TraceStore(max_size=100)
        for i in range(20):
            ts.add(self._make_span())
        assert len(ts.list_recent(5)) == 5


# ══════════════════════════════════════════════════════════════════════════════
# Module singletons
# ══════════════════════════════════════════════════════════════════════════════


class TestTelemetrySingletons:
    """Ensure module-level singletons work correctly."""

    def test_get_metrics_returns_same_instance(self):
        m1 = get_metrics()
        m2 = get_metrics()
        assert m1 is m2

    def test_get_traces_returns_same_instance(self):
        t1 = get_traces()
        t2 = get_traces()
        assert t1 is t2

    def test_reset_telemetry_clears_data(self):
        m = get_metrics()
        m.record_request("GET", "/x", 200, 10.0)
        get_traces()
        reset_telemetry()
        # After reset, singletons still work but data is cleared
        new_m = get_metrics()
        assert new_m.request_count == 0


# ══════════════════════════════════════════════════════════════════════════════
# Secret Scanner — Pattern Detection
# ══════════════════════════════════════════════════════════════════════════════


class TestSecretPatterns:
    """Test that each pattern correctly detects its target."""

    def test_aws_access_key(self):
        text = "AWS_KEY=AKIAIOSFODNN7EXAMPLE"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "aws_access_key" in ids

    def test_aws_secret_key(self):
        text = "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "aws_secret_key" in ids

    def test_private_key_pem(self):
        text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK..."
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "private_key" in ids

    def test_github_token_ghp(self):
        text = "GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "github_token" in ids

    def test_github_token_gho(self):
        text = "token: gho_abcdefghijklmnopqrstuvwxyz123456789A"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "github_token" in ids

    def test_stripe_key(self):
        # Use a clearly fake test key pattern
        text = "stripe_key = sk_test_aB1cD2eF3gH4iJ5kL6mN7oP8q"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "stripe_key" in ids

    def test_slack_token(self):
        text = "token = xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxx"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "slack_token" in ids

    def test_google_api_key(self):
        text = "GOOGLE_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "google_api_key" in ids

    def test_jwt_token(self):
        text = "Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "jwt_token" in ids

    def test_basic_auth(self):
        text = "Authorization: Basic dXNlcjpwYXNz"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "basic_auth" in ids

    def test_bearer_token(self):
        text = "Authorization: Bearer sk_live_some_token_here"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "bearer_token" in ids

    def test_connection_string_postgres(self):
        text = "DB_URL=postgres://user:pass@host:5432/dbname"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "connection_string" in ids

    def test_connection_string_mongodb(self):
        text = "MONGO_URI=mongodb://admin:password@localhost:27017/mydb"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "connection_string" in ids

    def test_generic_password(self):
        text = 'password = "super_secret_123"'
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "generic_password" in ids

    def test_generic_api_key(self):
        text = "api_key = abcdef1234567890abcdef1234567890ab"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "generic_api_key" in ids

    def test_ip_with_port(self):
        text = "server = 192.168.1.100:8080"
        findings = scan_text(text, "test")
        ids = [f.rule_id for f in findings]
        assert "ip_with_port" in ids

    def test_no_false_positive_clean_text(self):
        text = "Hello, this is a normal comment with no secrets."
        findings = scan_text(text, "test")
        assert len(findings) == 0

    def test_no_false_positive_short_key(self):
        text = "api_key = abc"
        findings = scan_text(text, "test")
        # Too short to match generic_api_key (needs 20+ hex chars)
        assert "generic_api_key" not in [f.rule_id for f in findings]


# ══════════════════════════════════════════════════════════════════════════════
# Secret Scanner — Scan Functions
# ══════════════════════════════════════════════════════════════════════════════


class TestSecretScanFunctions:
    """Test scan_text, scan_dict, scan_request, scan_environment."""

    def test_scan_text_multiline(self):
        text = "line1\nGITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890AB\nline3"
        findings = scan_text(text, "config")
        assert len(findings) >= 1
        assert findings[0].line_number == 2
        assert findings[0].location == "config"

    def test_scan_dict_nested(self):
        data = {
            "headers": {"X-Token": "ghp_abcdefghijklmnopqrstuvwxyz1234567890AB"},
            "connection": {"url": "postgres://admin:secret@db.host:5432/mydb"},
        }
        findings = scan_dict(data, "request")
        assert len(findings) >= 1

    def test_scan_dict_flat(self):
        data = {"key": "AKIAIOSFODNN7EXAMPLE"}
        findings = scan_dict(data, "env")
        ids = [f.rule_id for f in findings]
        assert "aws_access_key" in ids

    def test_scan_request_url_secrets(self):
        findings = scan_request(
            url="https://api.example.com?api_key=abcdef1234567890abcdef1234567890ab",
            method="GET",
            headers={},
        )
        assert len(findings) >= 1

    def test_scan_request_headers(self):
        # scan_request scans header values individually via scan_dict,
        # so we test with a header value that contains the full pattern
        findings = scan_request(
            url="https://api.example.com",
            method="GET",
            headers={"X-Token": "ghp_abcdefghijklmnopqrstuvwxyz1234567890AB"},
        )
        ids = [f.rule_id for f in findings]
        assert "github_token" in ids

    def test_scan_request_body(self):
        findings = scan_request(
            url="https://api.example.com",
            method="POST",
            headers={},
            body={"secret": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
        )
        ids = [f.rule_id for f in findings]
        assert "github_token" in ids

    def test_scan_request_clean(self):
        findings = scan_request(
            url="https://api.example.com/users",
            method="GET",
            headers={"Accept": "application/json"},
        )
        assert len(findings) == 0

    def test_scan_environment(self):
        env = {
            "AWS_ACCESS_KEY_ID": "AKIAIOSFODNN7EXAMPLE",
            "APP_NAME": "my-app",
        }
        findings = scan_environment(env)
        ids = [f.rule_id for f in findings]
        assert "aws_access_key" in ids

    def test_scan_environment_clean(self):
        env = {
            "APP_NAME": "my-app",
            "PORT": "3000",
            "DEBUG": "false",
        }
        findings = scan_environment(env)
        assert len(findings) == 0


# ══════════════════════════════════════════════════════════════════════════════
# Secret Scanner — Masking
# ══════════════════════════════════════════════════════════════════════════════


class TestSecretMasking:
    """Test _mask_match helper."""

    def test_mask_long_string(self):
        result = _mask_match("AKIAIOSFODNN7EXAMPLE")
        assert result.startswith("AKIAIOSF")
        assert "***" in result

    def test_mask_short_string(self):
        result = _mask_match("short")
        assert result == "sho***"

    def test_mask_empty(self):
        result = _mask_match("")
        assert result == "***"

    def test_finding_to_dict(self):
        f = SecretFinding(
            rule_id="test",
            rule_name="Test Rule",
            severity="high",
            description="A test",
            location="headers",
            match_preview="abc***",
            line_number=1,
        )
        d = f.to_dict()
        assert d["rule_id"] == "test"
        assert d["severity"] == "high"
        assert d["line_number"] == 1


# ══════════════════════════════════════════════════════════════════════════════
# Secret Scanner — Patterns Summary
# ══════════════════════════════════════════════════════════════════════════════


class TestPatternsSummary:
    """Test get_patterns_summary for UI."""

    def test_returns_all_patterns(self):
        summary = get_patterns_summary()
        assert len(summary) == len(_PATTERNS)

    def test_pattern_has_required_fields(self):
        summary = get_patterns_summary()
        for p in summary:
            assert "id" in p
            assert "name" in p
            assert "severity" in p
            assert "description" in p


# ══════════════════════════════════════════════════════════════════════════════
# Governance — Rule Checking
# ══════════════════════════════════════════════════════════════════════════════


class TestGovernanceCheckRequest:
    """Test GovernanceChecker.check_request against built-in rules."""

    def setup_method(self):
        self.checker = GovernanceChecker()

    def test_perfect_request_no_violations(self):
        report = self.checker.check_request(
            name="Get Users",
            method="GET",
            url="https://api.example.com/users",
            headers={"Authorization": "Bearer token", "Accept": "application/json"},
        )
        assert report.errors == 0
        # May have some info-level items but no errors

    def test_http_url_flagged(self):
        report = self.checker.check_request(
            name="Get Users",
            method="GET",
            url="http://api.example.com/users",
            headers={"Authorization": "Bearer x", "Accept": "application/json"},
        )
        violations = [v for v in report.violations if v.rule_id == "security_https_required"]
        assert len(violations) == 1
        assert violations[0].severity == "error"

    def test_no_name_flagged(self):
        report = self.checker.check_request(
            name="",
            method="GET",
            url="https://api.example.com/users",
        )
        violations = [v for v in report.violations if v.rule_id == "naming_request_has_name"]
        assert len(violations) == 1

    def test_trailing_slash_flagged(self):
        report = self.checker.check_request(
            name="Test",
            method="GET",
            url="https://api.example.com/users/",
        )
        violations = [v for v in report.violations if v.rule_id == "naming_url_no_trailing_slash"]
        assert len(violations) == 1

    def test_localhost_flagged(self):
        report = self.checker.check_request(
            name="Local",
            method="GET",
            url="https://localhost:3000/api",
        )
        violations = [v for v in report.violations if v.rule_id == "security_no_localhost"]
        assert len(violations) == 1

    def test_no_auth_flagged(self):
        report = self.checker.check_request(
            name="Get Users",
            method="GET",
            url="https://api.example.com/users",
            headers={"Accept": "application/json"},
        )
        violations = [v for v in report.violations if v.rule_id == "security_auth_required"]
        assert len(violations) == 1

    def test_auth_via_x_api_key(self):
        report = self.checker.check_request(
            name="Get Users",
            method="GET",
            url="https://api.example.com/users",
            headers={"X-API-Key": "my-key", "Accept": "application/json"},
        )
        violations = [v for v in report.violations if v.rule_id == "security_auth_required"]
        assert len(violations) == 0

    def test_post_without_content_type_flagged(self):
        report = self.checker.check_request(
            name="Create User",
            method="POST",
            url="https://api.example.com/users",
            headers={"Authorization": "Bearer x"},
            body={"name": "test"},
        )
        violations = [v for v in report.violations if v.rule_id == "consistency_content_type"]
        assert len(violations) == 1

    def test_post_with_content_type_passes(self):
        report = self.checker.check_request(
            name="Create User",
            method="POST",
            url="https://api.example.com/users",
            headers={"Authorization": "Bearer x", "Content-Type": "application/json"},
            body={"name": "test"},
        )
        violations = [v for v in report.violations if v.rule_id == "consistency_content_type"]
        assert len(violations) == 0

    def test_no_accept_header_info(self):
        report = self.checker.check_request(
            name="Get Users",
            method="GET",
            url="https://api.example.com/users",
            headers={"Authorization": "Bearer x"},
        )
        violations = [v for v in report.violations if v.rule_id == "consistency_accept_header"]
        assert len(violations) == 1
        assert violations[0].severity == "info"


# ══════════════════════════════════════════════════════════════════════════════
# Governance — Collection Checking
# ══════════════════════════════════════════════════════════════════════════════


class TestGovernanceCheckCollection:
    """Test GovernanceChecker.check_collection."""

    def setup_method(self):
        self.checker = GovernanceChecker()

    def test_collection_short_name_flagged(self):
        report = self.checker.check_collection(name="AB")
        violations = [v for v in report.violations if v.rule_id == "naming_collection_lowercase"]
        assert len(violations) == 1

    def test_collection_good_name_passes(self):
        report = self.checker.check_collection(name="User Management API")
        violations = [v for v in report.violations if v.rule_id == "naming_collection_lowercase"]
        assert len(violations) == 0

    def test_collection_checks_child_requests(self):
        report = self.checker.check_collection(
            name="My Collection",
            requests=[
                {"name": "Get Users", "method": "GET", "url": "http://example.com/users"},
            ],
        )
        # Should flag HTTP
        violations = [v for v in report.violations if v.rule_id == "security_https_required"]
        assert len(violations) == 1


# ══════════════════════════════════════════════════════════════════════════════
# Governance — Environment Checking
# ══════════════════════════════════════════════════════════════════════════════


class TestGovernanceCheckEnvironment:
    """Test GovernanceChecker.check_environment."""

    def setup_method(self):
        self.checker = GovernanceChecker()

    def test_uppercase_keys_pass(self):
        report = self.checker.check_environment({"API_URL": "x", "SECRET_KEY": "y"})
        assert report.errors == 0
        assert report.warnings == 0

    def test_lowercase_keys_flagged(self):
        report = self.checker.check_environment({"apiUrl": "x", "secret_key": "y"})
        violations = [v for v in report.violations if v.rule_id == "naming_env_uppercase"]
        assert len(violations) == 2

    def test_mixed_keys(self):
        report = self.checker.check_environment(
            {
                "API_URL": "x",
                "apiKey": "y",
                "BASE_URL": "z",
            }
        )
        violations = [v for v in report.violations if v.rule_id == "naming_env_uppercase"]
        assert len(violations) == 1  # only apiKey


# ══════════════════════════════════════════════════════════════════════════════
# Governance — Rule Management
# ══════════════════════════════════════════════════════════════════════════════


class TestGovernanceRuleManagement:
    """Test enable/disable rules and rule listing."""

    def test_disable_rule(self):
        checker = GovernanceChecker()
        assert checker.disable_rule("security_https_required")
        report = checker.check_request(
            name="Test",
            method="GET",
            url="http://insecure.com/api",
        )
        violations = [v for v in report.violations if v.rule_id == "security_https_required"]
        assert len(violations) == 0

    def test_enable_rule(self):
        checker = GovernanceChecker()
        checker.disable_rule("security_https_required")
        checker.enable_rule("security_https_required")
        report = checker.check_request(
            name="Test",
            method="GET",
            url="http://insecure.com/api",
        )
        violations = [v for v in report.violations if v.rule_id == "security_https_required"]
        assert len(violations) == 1

    def test_disable_nonexistent_returns_false(self):
        checker = GovernanceChecker()
        assert not checker.disable_rule("nonexistent_rule")

    def test_get_rules_returns_all(self):
        checker = GovernanceChecker()
        rules = checker.get_rules()
        assert len(rules) == len(BUILTIN_RULES)
        for r in rules:
            assert "id" in r
            assert "name" in r
            assert "category" in r
            assert "severity" in r
            assert "enabled" in r


# ══════════════════════════════════════════════════════════════════════════════
# Governance — Report & Score
# ══════════════════════════════════════════════════════════════════════════════


class TestGovernanceReport:
    """Test GovernanceReport score calculation."""

    def test_perfect_score(self):
        r = GovernanceReport(rules_checked=5, passed=5)
        assert r.score == 100

    def test_score_with_errors(self):
        r = GovernanceReport(rules_checked=5, passed=3, errors=2)
        assert r.score == 80  # 100 - 2*10

    def test_score_with_warnings(self):
        r = GovernanceReport(rules_checked=5, passed=3, warnings=2)
        assert r.score == 94  # 100 - 2*3

    def test_score_floor_zero(self):
        r = GovernanceReport(rules_checked=20, passed=0, errors=15)
        assert r.score == 0

    def test_score_empty_report(self):
        r = GovernanceReport()
        assert r.score == 100

    def test_to_dict(self):
        r = GovernanceReport(rules_checked=3, passed=2, errors=1)
        d = r.to_dict()
        assert d["rules_checked"] == 3
        assert d["passed"] == 2
        assert d["errors"] == 1
        assert "score" in d
        assert "violations" in d

    def test_violation_to_dict(self):
        v = RuleViolation(
            rule_id="test_rule",
            rule_name="Test",
            severity="error",
            category="security",
            message="fail",
            resource_type="request",
            resource_name="My Request",
        )
        d = v.to_dict()
        assert d["rule_id"] == "test_rule"
        assert d["severity"] == "error"
        assert d["resource_name"] == "My Request"


# ══════════════════════════════════════════════════════════════════════════════
# AuditLog Model
# ══════════════════════════════════════════════════════════════════════════════


class TestAuditLogModel:
    """Test AuditLog model and AuditCategory enum."""

    def test_audit_category_values(self):
        assert AuditCategory.AUTH.value == "auth"
        assert AuditCategory.SECURITY.value == "security"
        assert AuditCategory.ADMIN.value == "admin"
        assert AuditCategory.DATA.value == "data"
        assert AuditCategory.SYSTEM.value == "system"

    def test_audit_category_count(self):
        assert len(AuditCategory) == 5

    def test_audit_log_tablename(self):
        assert AuditLog.__tablename__ == "audit_logs"

    def test_audit_log_has_required_columns(self):
        columns = {c.name for c in AuditLog.__table__.columns}
        required = {
            "id",
            "category",
            "action",
            "resource_type",
            "resource_id",
            "user_id",
            "ip_address",
            "user_agent",
            "details",
            "severity",
            "created_at",
        }
        assert required.issubset(columns)

    def test_audit_log_indexes(self):
        index_names = {idx.name for idx in AuditLog.__table__.indexes}
        assert "ix_audit_logs_category_created" in index_names
        assert "ix_audit_logs_user" in index_names
        assert "ix_audit_logs_action" in index_names


# ══════════════════════════════════════════════════════════════════════════════
# Built-in Rules Enumeration
# ══════════════════════════════════════════════════════════════════════════════


class TestBuiltinRules:
    """Verify all 10 built-in governance rules exist."""

    def test_rule_count(self):
        assert len(BUILTIN_RULES) == 10

    def test_rule_ids_unique(self):
        ids = [r.id for r in BUILTIN_RULES]
        assert len(ids) == len(set(ids))

    def test_rule_categories(self):
        categories = {r.category for r in BUILTIN_RULES}
        assert "naming" in categories
        assert "security" in categories
        assert "consistency" in categories
        assert "performance" in categories

    def test_rule_severities(self):
        severities = {r.severity for r in BUILTIN_RULES}
        assert "error" in severities
        assert "warning" in severities
        assert "info" in severities

    def test_all_rules_enabled_by_default(self):
        for r in BUILTIN_RULES:
            assert r.enabled is True
