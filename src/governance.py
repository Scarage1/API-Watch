"""
API governance rules engine.

Validates saved requests and collections against configurable rules:
- Naming conventions (kebab-case, snake_case, camelCase)
- Auth enforcement (every request must have auth)
- Response format requirements (Content-Type checks)
- URL patterns (must use HTTPS, no localhost in prod)
- Header requirements (specific headers required)
- Body validation (max size, must have Content-Type)
"""
import re
import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

logger = logging.getLogger("apiwatch.governance")


# ── Rule definitions ──────────────────────────────────────────────────────────

@dataclass
class GovernanceRule:
    """A governance rule definition."""
    id: str
    name: str
    category: str    # naming, security, consistency, performance
    severity: str    # error, warning, info
    description: str
    enabled: bool = True


@dataclass
class RuleViolation:
    """A single governance rule violation."""
    rule_id: str
    rule_name: str
    severity: str
    category: str
    message: str
    resource_type: str  # request, collection, environment
    resource_name: str

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "severity": self.severity,
            "category": self.category,
            "message": self.message,
            "resource_type": self.resource_type,
            "resource_name": self.resource_name,
        }


@dataclass
class GovernanceReport:
    """Result of running all governance rules."""
    violations: List[RuleViolation] = field(default_factory=list)
    rules_checked: int = 0
    passed: int = 0
    warnings: int = 0
    errors: int = 0

    def to_dict(self) -> dict:
        return {
            "violations": [v.to_dict() for v in self.violations],
            "rules_checked": self.rules_checked,
            "passed": self.passed,
            "warnings": self.warnings,
            "errors": self.errors,
            "score": self.score,
        }

    @property
    def score(self) -> int:
        """Governance score 0-100. Errors deduct 10, warnings deduct 3."""
        if self.rules_checked == 0:
            return 100
        deductions = (self.errors * 10) + (self.warnings * 3)
        return max(0, 100 - deductions)


# ── Built-in rules ───────────────────────────────────────────────────────────

BUILTIN_RULES: List[GovernanceRule] = [
    GovernanceRule(
        id="naming_collection_lowercase",
        name="Collection names should be descriptive",
        category="naming",
        severity="warning",
        description="Collection names should be at least 3 characters",
    ),
    GovernanceRule(
        id="naming_request_has_name",
        name="Requests must have names",
        category="naming",
        severity="error",
        description="Every saved request should have a descriptive name",
    ),
    GovernanceRule(
        id="naming_url_no_trailing_slash",
        name="URLs should not have trailing slashes",
        category="naming",
        severity="warning",
        description="API URLs should not end with / (unless root)",
    ),
    GovernanceRule(
        id="security_https_required",
        name="HTTPS required",
        category="security",
        severity="error",
        description="All API requests should use HTTPS, not HTTP",
    ),
    GovernanceRule(
        id="security_no_localhost",
        name="No localhost URLs",
        category="security",
        severity="warning",
        description="Saved requests should not target localhost/127.0.0.1",
    ),
    GovernanceRule(
        id="security_auth_required",
        name="Authentication required",
        category="security",
        severity="warning",
        description="Requests should include an Authorization header or auth config",
    ),
    GovernanceRule(
        id="consistency_content_type",
        name="Content-Type header required for POST/PUT/PATCH",
        category="consistency",
        severity="warning",
        description="Mutating requests should specify Content-Type",
    ),
    GovernanceRule(
        id="consistency_accept_header",
        name="Accept header recommended",
        category="consistency",
        severity="info",
        description="Requests should specify an Accept header",
    ),
    GovernanceRule(
        id="performance_no_select_star",
        name="Avoid SELECT * in GraphQL-like queries",
        category="performance",
        severity="info",
        description="GraphQL queries should specify fields explicitly",
    ),
    GovernanceRule(
        id="naming_env_uppercase",
        name="Environment variable names should be UPPER_SNAKE_CASE",
        category="naming",
        severity="info",
        description="Convention: environment variable keys use UPPER_SNAKE_CASE",
    ),
]

_UPPER_SNAKE_RE = re.compile(r'^[A-Z][A-Z0-9_]*$')
_LOCALHOST_PATTERNS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


# ── Rule checker ─────────────────────────────────────────────────────────────

class GovernanceChecker:
    """Evaluates API governance rules against requests and collections."""

    def __init__(self, rules: Optional[List[GovernanceRule]] = None):
        self.rules = {r.id: r for r in (rules or BUILTIN_RULES)}

    def _is_enabled(self, rule_id: str) -> bool:
        rule = self.rules.get(rule_id)
        return rule is not None and rule.enabled

    def _add_violation(
        self,
        report: GovernanceReport,
        rule_id: str,
        message: str,
        resource_type: str,
        resource_name: str,
    ) -> None:
        rule = self.rules.get(rule_id)
        if not rule or not rule.enabled:
            return
        violation = RuleViolation(
            rule_id=rule_id,
            rule_name=rule.name,
            severity=rule.severity,
            category=rule.category,
            message=message,
            resource_type=resource_type,
            resource_name=resource_name,
        )
        report.violations.append(violation)
        if rule.severity == "error":
            report.errors += 1
        elif rule.severity == "warning":
            report.warnings += 1

    def check_request(
        self,
        name: str,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        body: Optional[Any] = None,
        auth_config: Optional[Dict[str, str]] = None,
    ) -> GovernanceReport:
        """Check a single request against all enabled rules."""
        report = GovernanceReport()
        headers = headers or {}
        headers_lower = {k.lower(): v for k, v in headers.items()}

        # naming_request_has_name
        if self._is_enabled("naming_request_has_name"):
            report.rules_checked += 1
            if not name or len(name.strip()) < 2:
                self._add_violation(report, "naming_request_has_name",
                    "Request has no name or name is too short",
                    "request", name or "(unnamed)")
            else:
                report.passed += 1

        # naming_url_no_trailing_slash
        if self._is_enabled("naming_url_no_trailing_slash"):
            report.rules_checked += 1
            # Allow root "/" but not "/api/users/"
            stripped = url.split("?")[0].rstrip("/")
            if url.split("?")[0] != stripped and url.split("?")[0] != "/":
                self._add_violation(report, "naming_url_no_trailing_slash",
                    f"URL ends with trailing slash: {url}",
                    "request", name or url)
            else:
                report.passed += 1

        # security_https_required
        if self._is_enabled("security_https_required"):
            report.rules_checked += 1
            if url.startswith("http://"):
                self._add_violation(report, "security_https_required",
                    f"URL uses HTTP instead of HTTPS: {url[:60]}",
                    "request", name or url)
            else:
                report.passed += 1

        # security_no_localhost
        if self._is_enabled("security_no_localhost"):
            report.rules_checked += 1
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = (parsed.hostname or "").lower()
            if host in _LOCALHOST_PATTERNS:
                self._add_violation(report, "security_no_localhost",
                    f"URL targets localhost: {host}",
                    "request", name or url)
            else:
                report.passed += 1

        # security_auth_required
        if self._is_enabled("security_auth_required"):
            report.rules_checked += 1
            has_auth = (
                "authorization" in headers_lower
                or "x-api-key" in headers_lower
                or (auth_config and any(auth_config.values()))
            )
            if not has_auth:
                self._add_violation(report, "security_auth_required",
                    "No authentication configured",
                    "request", name or url)
            else:
                report.passed += 1

        # consistency_content_type
        if self._is_enabled("consistency_content_type"):
            if method.upper() in ("POST", "PUT", "PATCH"):
                report.rules_checked += 1
                if "content-type" not in headers_lower and body:
                    self._add_violation(report, "consistency_content_type",
                        f"{method.upper()} request has body but no Content-Type header",
                        "request", name or url)
                else:
                    report.passed += 1

        # consistency_accept_header
        if self._is_enabled("consistency_accept_header"):
            report.rules_checked += 1
            if "accept" not in headers_lower:
                self._add_violation(report, "consistency_accept_header",
                    "No Accept header specified",
                    "request", name or url)
            else:
                report.passed += 1

        return report

    def check_collection(
        self,
        name: str,
        requests: Optional[List[dict]] = None,
    ) -> GovernanceReport:
        """Check a collection and all its requests."""
        report = GovernanceReport()

        # naming_collection_lowercase
        if self._is_enabled("naming_collection_lowercase"):
            report.rules_checked += 1
            if not name or len(name.strip()) < 3:
                self._add_violation(report, "naming_collection_lowercase",
                    f"Collection name too short: '{name}'",
                    "collection", name or "(unnamed)")
            else:
                report.passed += 1

        # Check each request
        for req in (requests or []):
            req_report = self.check_request(
                name=req.get("name", ""),
                method=req.get("method", "GET"),
                url=req.get("url", ""),
                headers=req.get("headers"),
                body=req.get("body"),
                auth_config=req.get("auth_config"),
            )
            report.violations.extend(req_report.violations)
            report.rules_checked += req_report.rules_checked
            report.passed += req_report.passed
            report.warnings += req_report.warnings
            report.errors += req_report.errors

        return report

    def check_environment(
        self,
        variables: Dict[str, str],
        env_name: str = "environment",
    ) -> GovernanceReport:
        """Check environment variable naming conventions."""
        report = GovernanceReport()

        if self._is_enabled("naming_env_uppercase"):
            for key in variables:
                report.rules_checked += 1
                if not _UPPER_SNAKE_RE.match(key):
                    self._add_violation(report, "naming_env_uppercase",
                        f"Variable '{key}' is not UPPER_SNAKE_CASE",
                        "environment", env_name)
                else:
                    report.passed += 1

        return report

    def get_rules(self) -> List[dict]:
        """Return all rules as dicts (for the settings UI)."""
        return [
            {
                "id": r.id,
                "name": r.name,
                "category": r.category,
                "severity": r.severity,
                "description": r.description,
                "enabled": r.enabled,
            }
            for r in self.rules.values()
        ]

    def enable_rule(self, rule_id: str) -> bool:
        if rule_id in self.rules:
            self.rules[rule_id].enabled = True
            return True
        return False

    def disable_rule(self, rule_id: str) -> bool:
        if rule_id in self.rules:
            self.rules[rule_id].enabled = False
            return True
        return False
