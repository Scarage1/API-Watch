"""
Secret scanner — regex-based detection of credentials, tokens, and API keys
in saved requests, environment variables, and scripts.

Scans for: AWS keys, GitHub tokens, JWTs, private keys, generic passwords,
Slack tokens, Stripe keys, Google API keys, basic auth patterns, etc.
"""
import re
import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger("apiwatch.secrets")


# ── Secret patterns ───────────────────────────────────────────────────────────

@dataclass
class SecretPattern:
    """Definition of a secret detection rule."""
    id: str
    name: str
    pattern: re.Pattern
    severity: str  # critical, high, medium, low
    description: str


# Compiled regex patterns — ordered by severity
_PATTERNS: List[SecretPattern] = [
    # ── Critical ──────────────────────────────────────────────────────────
    SecretPattern(
        id="aws_access_key",
        name="AWS Access Key ID",
        pattern=re.compile(r'(?:^|[^A-Z0-9])(?:AKIA[0-9A-Z]{16})(?:[^A-Z0-9]|$)'),
        severity="critical",
        description="AWS Access Key IDs start with AKIA and are 20 characters",
    ),
    SecretPattern(
        id="aws_secret_key",
        name="AWS Secret Access Key",
        pattern=re.compile(r'(?:aws_secret_access_key|aws_secret|secret_key)\s*[:=]\s*["\']?([A-Za-z0-9/+=]{40})', re.I),
        severity="critical",
        description="AWS Secret Access Keys are 40-character base64 strings",
    ),
    SecretPattern(
        id="private_key",
        name="Private Key",
        pattern=re.compile(r'-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----'),
        severity="critical",
        description="PEM-encoded private key detected",
    ),
    # ── High ──────────────────────────────────────────────────────────────
    SecretPattern(
        id="github_token",
        name="GitHub Token",
        pattern=re.compile(r'(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}'),
        severity="high",
        description="GitHub personal access or OAuth token",
    ),
    SecretPattern(
        id="stripe_key",
        name="Stripe API Key",
        pattern=re.compile(r'(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}'),
        severity="high",
        description="Stripe live or test API key",
    ),
    SecretPattern(
        id="slack_token",
        name="Slack Token",
        pattern=re.compile(r'xox[bpors]-[A-Za-z0-9-]{10,}'),
        severity="high",
        description="Slack bot, user, or app token",
    ),
    SecretPattern(
        id="google_api_key",
        name="Google API Key",
        pattern=re.compile(r'AIza[0-9A-Za-z\-_]{35}'),
        severity="high",
        description="Google Cloud / Maps / Firebase API key",
    ),
    SecretPattern(
        id="jwt_token",
        name="JWT Token",
        pattern=re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
        severity="high",
        description="JSON Web Token (3-part base64url encoded)",
    ),
    # ── Medium ────────────────────────────────────────────────────────────
    SecretPattern(
        id="basic_auth",
        name="Basic Auth Header",
        pattern=re.compile(r'(?:basic|authorization)\s*[:=]\s*["\']?Basic\s+[A-Za-z0-9+/=]{8,}', re.I),
        severity="medium",
        description="HTTP Basic authentication header with encoded credentials",
    ),
    SecretPattern(
        id="bearer_token",
        name="Bearer Token",
        pattern=re.compile(r'(?:bearer|authorization)\s*[:=]\s*["\']?Bearer\s+[A-Za-z0-9._\-]{20,}', re.I),
        severity="medium",
        description="Bearer token in authorization header",
    ),
    SecretPattern(
        id="connection_string",
        name="Database Connection String",
        pattern=re.compile(r'(?:mongodb|postgres|mysql|redis|amqp|mssql)://[^\s"\']+:[^\s"\']+@', re.I),
        severity="medium",
        description="Database connection string with embedded credentials",
    ),
    SecretPattern(
        id="generic_password",
        name="Password Assignment",
        pattern=re.compile(r'(?:password|passwd|pwd|secret)\s*[:=]\s*["\'][^\s"\']{8,}["\']', re.I),
        severity="medium",
        description="Password or secret assigned in plaintext",
    ),
    # ── Low ───────────────────────────────────────────────────────────────
    SecretPattern(
        id="generic_api_key",
        name="Generic API Key",
        pattern=re.compile(r'(?:api[_-]?key|apikey|api[_-]?secret|api[_-]?token)\s*[:=]\s*["\']?[A-Za-z0-9_\-]{16,}', re.I),
        severity="low",
        description="Generic API key or secret in assignment",
    ),
    SecretPattern(
        id="ip_with_port",
        name="Internal IP + Port",
        pattern=re.compile(r'(?:10|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\.\d{1,3}\.\d{1,3}:\d{2,5}'),
        severity="low",
        description="Internal/private IP address with port",
    ),
]


# ── Finding dataclass ────────────────────────────────────────────────────────

@dataclass
class SecretFinding:
    """A single secret detection result."""
    rule_id: str
    rule_name: str
    severity: str
    description: str
    location: str       # e.g. "request.headers", "env.DATABASE_URL"
    match_preview: str  # first 20 chars + masked
    line_number: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "severity": self.severity,
            "description": self.description,
            "location": self.location,
            "match_preview": self.match_preview,
            "line_number": self.line_number,
        }


# ── Scanner ──────────────────────────────────────────────────────────────────

def _mask_match(text: str, max_show: int = 8) -> str:
    """Show first few chars of a match, mask the rest."""
    if len(text) <= max_show:
        return text[:3] + "***"
    return text[:max_show] + "***" + text[-3:]


def scan_text(text: str, location: str = "unknown") -> List[SecretFinding]:
    """Scan a block of text for secrets. Returns list of findings."""
    if not text or not isinstance(text, str):
        return []

    findings: List[SecretFinding] = []
    lines = text.split("\n")

    for pattern_def in _PATTERNS:
        for line_num, line in enumerate(lines, start=1):
            for match in pattern_def.pattern.finditer(line):
                matched_text = match.group(0)
                findings.append(SecretFinding(
                    rule_id=pattern_def.id,
                    rule_name=pattern_def.name,
                    severity=pattern_def.severity,
                    description=pattern_def.description,
                    location=location,
                    match_preview=_mask_match(matched_text),
                    line_number=line_num,
                ))

    return findings


def scan_dict(data: Dict[str, Any], location_prefix: str = "") -> List[SecretFinding]:
    """Recursively scan a dictionary's string values for secrets."""
    findings: List[SecretFinding] = []
    if not isinstance(data, dict):
        return findings

    for key, value in data.items():
        loc = f"{location_prefix}.{key}" if location_prefix else key
        if isinstance(value, str):
            findings.extend(scan_text(value, location=loc))
        elif isinstance(value, dict):
            findings.extend(scan_dict(value, location_prefix=loc))
        elif isinstance(value, list):
            for i, item in enumerate(value):
                if isinstance(item, str):
                    findings.extend(scan_text(item, location=f"{loc}[{i}]"))
                elif isinstance(item, dict):
                    findings.extend(scan_dict(item, location_prefix=f"{loc}[{i}]"))

    return findings


def scan_request(
    url: str = "",
    method: str = "",
    headers: Optional[Dict[str, str]] = None,
    body: Optional[Any] = None,
    auth_config: Optional[Dict[str, str]] = None,
) -> List[SecretFinding]:
    """Scan all parts of an API request for secrets."""
    findings: List[SecretFinding] = []

    # URL
    findings.extend(scan_text(url, location="url"))

    # Headers
    if headers:
        findings.extend(scan_dict(headers, location_prefix="headers"))

    # Body
    if isinstance(body, str):
        findings.extend(scan_text(body, location="body"))
    elif isinstance(body, dict):
        findings.extend(scan_dict(body, location_prefix="body"))

    # Auth config
    if auth_config:
        findings.extend(scan_dict(auth_config, location_prefix="auth_config"))

    return findings


def scan_environment(variables: Dict[str, str]) -> List[SecretFinding]:
    """Scan environment variables for leaked secrets."""
    return scan_dict(variables, location_prefix="env")


def get_patterns_summary() -> List[dict]:
    """Return a summary of all detection rules (for the governance UI)."""
    return [
        {
            "id": p.id,
            "name": p.name,
            "severity": p.severity,
            "description": p.description,
        }
        for p in _PATTERNS
    ]
