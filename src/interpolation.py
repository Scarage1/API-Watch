"""
Variable interpolation engine for API-Watch.
Handles {{variable}} replacement in request URLs, headers, bodies, and params.
Supports dynamic variables like $randomUUID, $timestamp, $isoTimestamp, etc.
"""

import random
import re
import time
import uuid
from datetime import UTC, datetime
from typing import Any

_VAR_PATTERN = re.compile(r"\{\{(\$?[A-Za-z0-9_.\-]+)\}\}")

_DYNAMIC_GENERATORS = {
    "$randomUUID": lambda: str(uuid.uuid4()),
    "$timestamp": lambda: str(int(time.time())),
    "$isoTimestamp": lambda: datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    "$randomInt": lambda: str(random.randint(0, 9999)),
    "$randomEmail": lambda: f"user{random.randint(0, 99999)}@test.example.com",
    "$randomString": lambda: uuid.uuid4().hex[:8],
    "$randomBoolean": lambda: str(random.choice([True, False])).lower(),
}


def interpolate_string(text: str, variables: dict[str, str]) -> str:
    """Replace {{VAR}} placeholders in a string with variable values."""
    if not text or "{{" not in text:
        return text

    def replacer(m: re.Match) -> str:
        name = m.group(1)
        if name in variables:
            return variables[name]
        gen = _DYNAMIC_GENERATORS.get(name)
        if gen:
            return gen()
        return m.group(0)  # leave unresolved

    return _VAR_PATTERN.sub(replacer, text)


def interpolate_dict(d: dict[str, str], variables: dict[str, str]) -> dict[str, str]:
    """Interpolate all keys and values in a dict."""
    return {
        interpolate_string(k, variables): interpolate_string(v, variables) for k, v in d.items()
    }


def interpolate_body(body: Any, variables: dict[str, str]) -> Any:
    """Interpolate variable placeholders in a request body."""
    if body is None:
        return None
    if isinstance(body, str):
        return interpolate_string(body, variables)
    if isinstance(body, dict):
        return {
            interpolate_string(str(k), variables): (
                interpolate_string(v, variables) if isinstance(v, str) else v
            )
            for k, v in body.items()
        }
    return body
