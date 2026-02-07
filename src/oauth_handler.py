"""
OAuth 2.0 helper — supports Authorization Code + PKCE, Client Credentials,
and Password Grant flows. Provides both utility functions for the runner
and FastAPI routes for the frontend token-exchange proxy.
"""
import hashlib
import base64
import secrets
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

logger = logging.getLogger(__name__)


# ── PKCE helpers ──────────────────────────────────────────────────────────────

def generate_code_verifier(length: int = 64) -> str:
    """Generate a cryptographically random PKCE code_verifier (43-128 chars)."""
    length = max(43, min(128, length))
    return base64.urlsafe_b64encode(secrets.token_bytes(length)).rstrip(b"=").decode("ascii")[:length]


def generate_code_challenge(verifier: str) -> str:
    """Derive the S256 code_challenge from a code_verifier."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


# ── Token exchange functions ──────────────────────────────────────────────────

@dataclass
class OAuthTokenResult:
    """Result from an OAuth token exchange."""
    success: bool
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "Bearer"
    expires_in: Optional[int] = None
    scope: Optional[str] = None
    id_token: Optional[str] = None
    error: Optional[str] = None
    error_description: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None


async def exchange_authorization_code(
    token_url: str,
    client_id: str,
    code: str,
    redirect_uri: str,
    client_secret: Optional[str] = None,
    code_verifier: Optional[str] = None,
    extra_params: Optional[Dict[str, str]] = None,
) -> OAuthTokenResult:
    """Exchange an authorization code for tokens (Auth Code / Auth Code + PKCE)."""
    if httpx is None:
        return OAuthTokenResult(success=False, error="httpx not installed")

    data: Dict[str, str] = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "redirect_uri": redirect_uri,
    }
    if client_secret:
        data["client_secret"] = client_secret
    if code_verifier:
        data["code_verifier"] = code_verifier
    if extra_params:
        data.update(extra_params)

    return await _post_token_request(token_url, data)


async def client_credentials_grant(
    token_url: str,
    client_id: str,
    client_secret: str,
    scope: Optional[str] = None,
    extra_params: Optional[Dict[str, str]] = None,
) -> OAuthTokenResult:
    """Obtain a token using Client Credentials grant."""
    if httpx is None:
        return OAuthTokenResult(success=False, error="httpx not installed")

    data: Dict[str, str] = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if scope:
        data["scope"] = scope
    if extra_params:
        data.update(extra_params)

    return await _post_token_request(token_url, data)


async def password_grant(
    token_url: str,
    client_id: str,
    username: str,
    password: str,
    client_secret: Optional[str] = None,
    scope: Optional[str] = None,
    extra_params: Optional[Dict[str, str]] = None,
) -> OAuthTokenResult:
    """Obtain a token using Resource Owner Password Credentials grant."""
    if httpx is None:
        return OAuthTokenResult(success=False, error="httpx not installed")

    data: Dict[str, str] = {
        "grant_type": "password",
        "client_id": client_id,
        "username": username,
        "password": password,
    }
    if client_secret:
        data["client_secret"] = client_secret
    if scope:
        data["scope"] = scope
    if extra_params:
        data.update(extra_params)

    return await _post_token_request(token_url, data)


async def refresh_token_grant(
    token_url: str,
    client_id: str,
    refresh_token: str,
    client_secret: Optional[str] = None,
    scope: Optional[str] = None,
) -> OAuthTokenResult:
    """Refresh an expired access_token using a refresh_token."""
    if httpx is None:
        return OAuthTokenResult(success=False, error="httpx not installed")

    data: Dict[str, str] = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
    }
    if client_secret:
        data["client_secret"] = client_secret
    if scope:
        data["scope"] = scope

    return await _post_token_request(token_url, data)


def build_authorization_url(
    auth_url: str,
    client_id: str,
    redirect_uri: str,
    scope: Optional[str] = None,
    state: Optional[str] = None,
    code_challenge: Optional[str] = None,
    response_type: str = "code",
    extra_params: Optional[Dict[str, str]] = None,
) -> str:
    """Build the authorization URL for Auth Code / Auth Code + PKCE flow."""
    from urllib.parse import urlencode, urlparse, parse_qs, urlunparse

    params: Dict[str, str] = {
        "response_type": response_type,
        "client_id": client_id,
        "redirect_uri": redirect_uri,
    }
    if scope:
        params["scope"] = scope
    if state:
        params["state"] = state
    if code_challenge:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"
    if extra_params:
        params.update(extra_params)

    parsed = urlparse(auth_url)
    existing_qs = parse_qs(parsed.query)
    # Flatten existing params
    flat_existing = {k: v[0] for k, v in existing_qs.items()}
    flat_existing.update(params)

    new_qs = urlencode(flat_existing)
    return urlunparse(parsed._replace(query=new_qs))


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _post_token_request(token_url: str, data: Dict[str, str]) -> OAuthTokenResult:
    """POST to a token endpoint and parse the response."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                token_url,
                data=data,
                headers={"Accept": "application/json"},
            )

        body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}

        if resp.is_success and "access_token" in body:
            return OAuthTokenResult(
                success=True,
                access_token=body.get("access_token"),
                refresh_token=body.get("refresh_token"),
                token_type=body.get("token_type", "Bearer"),
                expires_in=body.get("expires_in"),
                scope=body.get("scope"),
                id_token=body.get("id_token"),
                raw_response=body,
            )
        else:
            return OAuthTokenResult(
                success=False,
                error=body.get("error", f"HTTP {resp.status_code}"),
                error_description=body.get("error_description", resp.text),
                raw_response=body if body else None,
            )

    except Exception as exc:
        logger.error("OAuth token exchange failed: %s", exc)
        return OAuthTokenResult(
            success=False,
            error="token_exchange_error",
            error_description=str(exc),
        )
