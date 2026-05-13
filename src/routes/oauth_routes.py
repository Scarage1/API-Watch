"""
OAuth 2.0 proxy routes — frontend calls these to exchange codes/credentials
for tokens without exposing client secrets to the browser.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..jwt_auth import get_current_user
from ..models import User
from ..oauth_handler import (
    build_authorization_url,
    client_credentials_grant,
    exchange_authorization_code,
    generate_code_challenge,
    generate_code_verifier,
    password_grant,
    refresh_token_grant,
)

router = APIRouter(prefix="/oauth", tags=["OAuth 2.0"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class AuthCodeExchangeRequest(BaseModel):
    token_url: str
    client_id: str
    code: str
    redirect_uri: str
    client_secret: str | None = None
    code_verifier: str | None = None


class ClientCredentialsRequest(BaseModel):
    token_url: str
    client_id: str
    client_secret: str
    scope: str | None = None


class PasswordGrantRequest(BaseModel):
    token_url: str
    client_id: str
    username: str
    password: str
    client_secret: str | None = None
    scope: str | None = None


class RefreshTokenRequest(BaseModel):
    token_url: str
    client_id: str
    refresh_token: str
    client_secret: str | None = None
    scope: str | None = None


class BuildAuthUrlRequest(BaseModel):
    auth_url: str
    client_id: str
    redirect_uri: str
    scope: str | None = None
    use_pkce: bool = True


class PKCEResponse(BaseModel):
    code_verifier: str
    code_challenge: str


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("/pkce")
async def create_pkce_pair(
    user: User = Depends(get_current_user),
):
    """Generate a PKCE code_verifier / code_challenge pair."""
    verifier = generate_code_verifier()
    challenge = generate_code_challenge(verifier)
    return {"code_verifier": verifier, "code_challenge": challenge}


@router.post("/authorize-url")
async def create_authorize_url(
    body: BuildAuthUrlRequest,
    user: User = Depends(get_current_user),
):
    """Build an authorization URL (optionally with PKCE challenge)."""
    code_challenge = None
    code_verifier = None
    if body.use_pkce:
        code_verifier = generate_code_verifier()
        code_challenge = generate_code_challenge(code_verifier)

    import secrets as _secrets

    state = _secrets.token_urlsafe(32)

    url = build_authorization_url(
        auth_url=body.auth_url,
        client_id=body.client_id,
        redirect_uri=body.redirect_uri,
        scope=body.scope,
        state=state,
        code_challenge=code_challenge,
    )
    result = {"url": url, "state": state}
    if code_verifier:
        result["code_verifier"] = code_verifier
    return result


@router.post("/token/authorization-code")
async def exchange_auth_code(
    body: AuthCodeExchangeRequest,
    user: User = Depends(get_current_user),
):
    """Exchange an authorization code for tokens."""
    result = await exchange_authorization_code(
        token_url=body.token_url,
        client_id=body.client_id,
        code=body.code,
        redirect_uri=body.redirect_uri,
        client_secret=body.client_secret,
        code_verifier=body.code_verifier,
    )
    if not result.success:
        raise HTTPException(
            status_code=400,
            detail=f"Token exchange failed: {result.error_description or result.error}",
        )
    return {
        "access_token": result.access_token,
        "refresh_token": result.refresh_token,
        "token_type": result.token_type,
        "expires_in": result.expires_in,
        "scope": result.scope,
        "id_token": result.id_token,
    }


@router.post("/token/client-credentials")
async def get_client_credentials_token(
    body: ClientCredentialsRequest,
    user: User = Depends(get_current_user),
):
    """Obtain a token using Client Credentials grant."""
    result = await client_credentials_grant(
        token_url=body.token_url,
        client_id=body.client_id,
        client_secret=body.client_secret,
        scope=body.scope,
    )
    if not result.success:
        raise HTTPException(
            status_code=400,
            detail=f"Token exchange failed: {result.error_description or result.error}",
        )
    return {
        "access_token": result.access_token,
        "token_type": result.token_type,
        "expires_in": result.expires_in,
        "scope": result.scope,
    }


@router.post("/token/password")
async def get_password_grant_token(
    body: PasswordGrantRequest,
    user: User = Depends(get_current_user),
):
    """Obtain a token using Resource Owner Password Credentials grant."""
    result = await password_grant(
        token_url=body.token_url,
        client_id=body.client_id,
        username=body.username,
        password=body.password,
        client_secret=body.client_secret,
        scope=body.scope,
    )
    if not result.success:
        raise HTTPException(
            status_code=400,
            detail=f"Token exchange failed: {result.error_description or result.error}",
        )
    return {
        "access_token": result.access_token,
        "refresh_token": result.refresh_token,
        "token_type": result.token_type,
        "expires_in": result.expires_in,
        "scope": result.scope,
    }


@router.post("/token/refresh")
async def refresh_access_token(
    body: RefreshTokenRequest,
    user: User = Depends(get_current_user),
):
    """Refresh an expired access_token."""
    result = await refresh_token_grant(
        token_url=body.token_url,
        client_id=body.client_id,
        refresh_token=body.refresh_token,
        client_secret=body.client_secret,
        scope=body.scope,
    )
    if not result.success:
        raise HTTPException(
            status_code=400,
            detail=f"Token refresh failed: {result.error_description or result.error}",
        )
    return {
        "access_token": result.access_token,
        "refresh_token": result.refresh_token,
        "token_type": result.token_type,
        "expires_in": result.expires_in,
        "scope": result.scope,
    }
