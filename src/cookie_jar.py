"""
Cookie jar management — domain-scoped cookie storage that auto-captures
Set-Cookie headers and forwards matching cookies on subsequent requests.
"""
import time
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass, field
from http.cookiejar import CookieJar
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


@dataclass
class Cookie:
    """A single HTTP cookie."""
    name: str
    value: str
    domain: str
    path: str = "/"
    expires: Optional[float] = None
    secure: bool = False
    http_only: bool = False
    same_site: Optional[str] = None
    created_at: float = field(default_factory=time.time)

    @property
    def is_expired(self) -> bool:
        if self.expires is None:
            return False  # session cookie
        return time.time() > self.expires

    def matches_url(self, url: str) -> bool:
        """Check if this cookie should be sent with a request to the given URL."""
        parsed = urlparse(url)
        host = parsed.hostname or ""
        path = parsed.path or "/"

        # Domain matching
        if self.domain.startswith("."):
            if not (host == self.domain[1:] or host.endswith(self.domain)):
                return False
        else:
            if host != self.domain:
                return False

        # Path matching
        if not path.startswith(self.path):
            return False

        # Secure flag
        if self.secure and parsed.scheme != "https":
            return False

        return True

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "value": self.value,
            "domain": self.domain,
            "path": self.path,
            "expires": self.expires,
            "secure": self.secure,
            "http_only": self.http_only,
            "same_site": self.same_site,
            "is_expired": self.is_expired,
        }


class CookieStore:
    """In-memory cookie jar with domain scoping and auto-expiry."""

    def __init__(self):
        self._cookies: List[Cookie] = []

    # ── Public API ────────────────────────────────────────────────────────

    def capture_from_headers(self, url: str, headers: Dict[str, str]) -> int:
        """Parse Set-Cookie headers from a response and store them.

        Returns the number of cookies captured.
        """
        parsed = urlparse(url)
        default_domain = parsed.hostname or ""
        captured = 0

        # Handle both single and multiple Set-Cookie headers
        set_cookies: List[str] = []
        for key, val in headers.items():
            if key.lower() == "set-cookie":
                set_cookies.append(val)

        for raw in set_cookies:
            cookie = self._parse_set_cookie(raw, default_domain)
            if cookie:
                self._upsert(cookie)
                captured += 1

        return captured

    def get_cookies_for_url(self, url: str) -> Dict[str, str]:
        """Return a dict of name→value for cookies matching the URL."""
        self._purge_expired()
        result: Dict[str, str] = {}
        for c in self._cookies:
            if c.matches_url(url):
                result[c.name] = c.value
        return result

    def get_cookie_header(self, url: str) -> Optional[str]:
        """Build a Cookie header string for the given URL, or None."""
        cookies = self.get_cookies_for_url(url)
        if not cookies:
            return None
        return "; ".join(f"{k}={v}" for k, v in cookies.items())

    def set_cookie(
        self,
        name: str,
        value: str,
        domain: str,
        path: str = "/",
        expires: Optional[float] = None,
        secure: bool = False,
    ) -> None:
        """Manually set a cookie."""
        cookie = Cookie(
            name=name, value=value, domain=domain,
            path=path, expires=expires, secure=secure,
        )
        self._upsert(cookie)

    def delete_cookie(self, name: str, domain: str) -> bool:
        """Delete a cookie by name and domain."""
        before = len(self._cookies)
        self._cookies = [
            c for c in self._cookies
            if not (c.name == name and c.domain == domain)
        ]
        return len(self._cookies) < before

    def clear(self, domain: Optional[str] = None) -> int:
        """Clear all cookies, or only those for a specific domain."""
        before = len(self._cookies)
        if domain:
            self._cookies = [c for c in self._cookies if c.domain != domain]
        else:
            self._cookies = []
        return before - len(self._cookies)

    def list_all(self) -> List[dict]:
        """Return all cookies as dicts."""
        self._purge_expired()
        return [c.to_dict() for c in self._cookies]

    @property
    def count(self) -> int:
        self._purge_expired()
        return len(self._cookies)

    # ── Internals ─────────────────────────────────────────────────────────

    def _upsert(self, cookie: Cookie) -> None:
        """Insert or update a cookie (match by name + domain + path)."""
        for i, existing in enumerate(self._cookies):
            if (existing.name == cookie.name
                    and existing.domain == cookie.domain
                    and existing.path == cookie.path):
                self._cookies[i] = cookie
                return
        self._cookies.append(cookie)

    def _purge_expired(self) -> None:
        """Remove expired cookies."""
        self._cookies = [c for c in self._cookies if not c.is_expired]

    @staticmethod
    def _parse_set_cookie(raw: str, default_domain: str) -> Optional[Cookie]:
        """Parse a Set-Cookie header value into a Cookie object."""
        parts = [p.strip() for p in raw.split(";")]
        if not parts:
            return None

        # First part is name=value
        name_val = parts[0]
        if "=" not in name_val:
            return None

        eq_idx = name_val.index("=")
        name = name_val[:eq_idx].strip()
        value = name_val[eq_idx + 1:].strip()

        if not name:
            return None

        cookie = Cookie(name=name, value=value, domain=default_domain)

        # Parse attributes
        for attr in parts[1:]:
            attr_lower = attr.lower().strip()
            if "=" in attr:
                attr_name, attr_val = attr.split("=", 1)
                attr_name = attr_name.strip().lower()
                attr_val = attr_val.strip()

                if attr_name == "domain":
                    cookie.domain = attr_val.lstrip(".")
                    if not attr_val.startswith("."):
                        cookie.domain = attr_val
                    else:
                        cookie.domain = attr_val
                elif attr_name == "path":
                    cookie.path = attr_val
                elif attr_name == "max-age":
                    try:
                        cookie.expires = time.time() + int(attr_val)
                    except ValueError:
                        pass
                elif attr_name == "samesite":
                    cookie.same_site = attr_val
            else:
                if attr_lower == "secure":
                    cookie.secure = True
                elif attr_lower == "httponly":
                    cookie.http_only = True

        return cookie


# ── Module-level singleton (per-session) ──────────────────────────────────────

_store: Optional[CookieStore] = None


def get_cookie_store() -> CookieStore:
    """Return the global cookie store (created on first call)."""
    global _store
    if _store is None:
        _store = CookieStore()
    return _store


def reset_cookie_store() -> None:
    """Reset the global cookie store (for testing)."""
    global _store
    _store = CookieStore()
