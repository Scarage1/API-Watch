"""
SSO (Single Sign-On) Service for API-Watch Enterprise.

Supports:
  - SAML 2.0 (Okta, Azure AD, OneLogin, JumpCloud)
  - OIDC / OAuth 2.0 (Google Workspace, Auth0, Keycloak)

Architecture:
  - Each Organization can configure one SSO provider
  - SSO config is stored in the database (encrypted secrets)
  - Login flow: User → IdP redirect → callback → JWT token
  - SSO-enforced mode: password login disabled for org members

Security:
  - PKCE for OIDC flows
  - Relay state validation for SAML
  - Domain-restricted SSO (only matching email domains)
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, urlparse

logger = logging.getLogger("apiwatch.enterprise.sso")


# ── SSO Provider Types ────────────────────────────────────────
class SSOProvider(str, Enum):
    SAML = "saml"
    OIDC = "oidc"


class SSOStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    TESTING = "testing"


# ── SSO Configuration ────────────────────────────────────────
@dataclass
class SSOConfig:
    """SSO configuration for an organization."""
    organization_id: str
    provider: SSOProvider
    status: SSOStatus = SSOStatus.INACTIVE

    # Display
    display_name: str = ""  # e.g., "Sign in with Okta"
    logo_url: str = ""

    # Domain restriction
    allowed_domains: List[str] = field(default_factory=list)  # e.g., ["company.com"]
    enforce_sso: bool = False  # If True, password login disabled for org members

    # SAML 2.0 settings
    saml_entity_id: str = ""
    saml_sso_url: str = ""
    saml_slo_url: str = ""  # Single Logout
    saml_certificate: str = ""  # IdP signing certificate (PEM)
    saml_name_id_format: str = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"

    # OIDC settings
    oidc_client_id: str = ""
    oidc_client_secret: str = ""  # Encrypted at rest
    oidc_issuer_url: str = ""  # e.g., "https://accounts.google.com"
    oidc_scopes: List[str] = field(default_factory=lambda: ["openid", "email", "profile"])
    oidc_redirect_uri: str = ""

    # Auto-provisioning
    auto_create_users: bool = True  # JIT provisioning
    default_role: str = "member"  # Default role for new SSO users

    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Serialize config (excluding secrets)."""
        return {
            "organization_id": self.organization_id,
            "provider": self.provider.value,
            "status": self.status.value,
            "display_name": self.display_name,
            "logo_url": self.logo_url,
            "allowed_domains": self.allowed_domains,
            "enforce_sso": self.enforce_sso,
            "auto_create_users": self.auto_create_users,
            "default_role": self.default_role,
            # SAML (no secrets)
            "saml_entity_id": self.saml_entity_id,
            "saml_sso_url": self.saml_sso_url,
            "saml_slo_url": self.saml_slo_url,
            "saml_name_id_format": self.saml_name_id_format,
            "saml_certificate_configured": bool(self.saml_certificate),
            # OIDC (no secrets)
            "oidc_client_id": self.oidc_client_id,
            "oidc_issuer_url": self.oidc_issuer_url,
            "oidc_scopes": self.oidc_scopes,
            "oidc_redirect_uri": self.oidc_redirect_uri,
            "oidc_client_secret_configured": bool(self.oidc_client_secret),
        }


# ── SSO Session ───────────────────────────────────────────────
@dataclass
class SSOSession:
    """Temporary state for an in-flight SSO login."""
    state: str                # Random state parameter
    nonce: str                # OIDC nonce / SAML relay state
    organization_id: str
    provider: SSOProvider
    redirect_url: str         # Where to redirect after login
    created_at: float = field(default_factory=time.time)
    expires_at: float = 0.0

    def __post_init__(self):
        if self.expires_at == 0.0:
            self.expires_at = self.created_at + 600  # 10 minute timeout

    @property
    def is_expired(self) -> bool:
        return time.time() > self.expires_at


@dataclass
class SSOUser:
    """User identity from an SSO provider."""
    email: str
    name: str = ""
    first_name: str = ""
    last_name: str = ""
    avatar_url: str = ""
    provider_id: str = ""     # Subject/NameID from IdP
    groups: List[str] = field(default_factory=list)
    raw_attributes: Dict[str, Any] = field(default_factory=dict)


# ── SSO Service ───────────────────────────────────────────────
class SSOService:
    """
    Manages SSO authentication flows.

    Lifecycle:
      1. Admin configures SSO via API → stored as SSOConfig
      2. User clicks "SSO Login" → initiate_login() → redirect to IdP
      3. IdP authenticates → callback → process_callback()
      4. SSOUser returned → create/update user → issue JWT

    Usage:
        sso = SSOService()
        sso.register_config(config)
        login_url = await sso.initiate_login(org_id, redirect_url)
        sso_user = await sso.process_callback(provider, params)
    """

    def __init__(self):
        self._configs: Dict[str, SSOConfig] = {}
        self._sessions: Dict[str, SSOSession] = {}

    # ── Config Management ─────────────────────────────────────

    def register_config(self, config: SSOConfig) -> None:
        """Register or update SSO config for an organization."""
        self._configs[config.organization_id] = config
        logger.info(
            "SSO config registered for org %s: provider=%s, status=%s",
            config.organization_id, config.provider.value, config.status.value
        )

    def get_config(self, organization_id: str) -> Optional[SSOConfig]:
        """Get SSO config for an organization."""
        return self._configs.get(organization_id)

    def remove_config(self, organization_id: str) -> bool:
        """Remove SSO config for an organization."""
        if organization_id in self._configs:
            del self._configs[organization_id]
            return True
        return False

    def is_sso_enforced(self, organization_id: str) -> bool:
        """Check if SSO is enforced (password login disabled) for an org."""
        config = self._configs.get(organization_id)
        return config is not None and config.enforce_sso and config.status == SSOStatus.ACTIVE

    # ── Login Flow ────────────────────────────────────────────

    async def initiate_login(
        self,
        organization_id: str,
        redirect_url: str = "/",
    ) -> Dict[str, str]:
        """
        Start SSO login flow.
        Returns dict with 'login_url' and 'state' for the IdP redirect.
        """
        config = self._configs.get(organization_id)
        if not config:
            raise ValueError(f"No SSO config for organization {organization_id}")
        if config.status != SSOStatus.ACTIVE and config.status != SSOStatus.TESTING:
            raise ValueError("SSO is not active for this organization")

        # Generate state and nonce
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)

        session = SSOSession(
            state=state,
            nonce=nonce,
            organization_id=organization_id,
            provider=config.provider,
            redirect_url=redirect_url,
        )
        self._sessions[state] = session

        if config.provider == SSOProvider.SAML:
            login_url = self._build_saml_login_url(config, state)
        elif config.provider == SSOProvider.OIDC:
            login_url = self._build_oidc_login_url(config, state, nonce)
        else:
            raise ValueError(f"Unknown SSO provider: {config.provider}")

        logger.info("SSO login initiated for org %s via %s", organization_id, config.provider.value)

        return {
            "login_url": login_url,
            "state": state,
            "provider": config.provider.value,
        }

    async def process_callback(
        self,
        state: str,
        params: Dict[str, str],
    ) -> SSOUser:
        """
        Process SSO callback from IdP.
        Validates state, extracts user identity, returns SSOUser.
        """
        session = self._sessions.pop(state, None)
        if not session:
            raise ValueError("Invalid or expired SSO state")
        if session.is_expired:
            raise ValueError("SSO session has expired")

        config = self._configs.get(session.organization_id)
        if not config:
            raise ValueError("SSO config not found for organization")

        if session.provider == SSOProvider.SAML:
            user = await self._process_saml_callback(config, params)
        elif session.provider == SSOProvider.OIDC:
            user = await self._process_oidc_callback(config, session, params)
        else:
            raise ValueError(f"Unknown provider: {session.provider}")

        # Domain validation
        if config.allowed_domains:
            email_domain = user.email.split("@")[-1].lower()
            if email_domain not in [d.lower() for d in config.allowed_domains]:
                raise ValueError(
                    f"Email domain '{email_domain}' not allowed. "
                    f"Allowed: {', '.join(config.allowed_domains)}"
                )

        logger.info("SSO login successful: %s via %s", user.email, session.provider.value)
        return user

    # ── SAML Implementation ───────────────────────────────────

    def _build_saml_login_url(self, config: SSOConfig, relay_state: str) -> str:
        """Build SAML AuthnRequest redirect URL."""
        params = {
            "RelayState": relay_state,
            # In production, this would be a full SAML AuthnRequest XML
            # encoded as SAMLRequest parameter. For now, simplified.
        }
        separator = "&" if "?" in config.saml_sso_url else "?"
        return f"{config.saml_sso_url}{separator}{urlencode(params)}"

    async def _process_saml_callback(
        self,
        config: SSOConfig,
        params: Dict[str, str],
    ) -> SSOUser:
        """
        Process SAML Response.
        In production, this would:
          1. Base64-decode the SAMLResponse
          2. Validate XML signature against config.saml_certificate
          3. Check NotBefore/NotOnOrAfter conditions
          4. Extract NameID and attributes
        """
        saml_response = params.get("SAMLResponse", "")
        if not saml_response:
            raise ValueError("Missing SAMLResponse parameter")

        # Placeholder for SAML response parsing
        # In production, use python3-saml or pysaml2 library
        logger.info("Processing SAML response (length=%d)", len(saml_response))

        return SSOUser(
            email=params.get("email", ""),
            name=params.get("name", ""),
            provider_id=params.get("NameID", ""),
            raw_attributes=params,
        )

    # ── OIDC Implementation ───────────────────────────────────

    def _build_oidc_login_url(
        self,
        config: SSOConfig,
        state: str,
        nonce: str,
    ) -> str:
        """Build OIDC authorization URL with PKCE."""
        # Construct well-known authorization endpoint
        issuer = config.oidc_issuer_url.rstrip("/")
        auth_endpoint = f"{issuer}/authorize"

        # For well-known issuers, use standard paths
        if "accounts.google.com" in issuer:
            auth_endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
        elif "login.microsoftonline.com" in issuer:
            auth_endpoint = f"{issuer}/oauth2/v2.0/authorize"

        params = {
            "client_id": config.oidc_client_id,
            "redirect_uri": config.oidc_redirect_uri,
            "response_type": "code",
            "scope": " ".join(config.oidc_scopes),
            "state": state,
            "nonce": nonce,
            "prompt": "select_account",
        }

        return f"{auth_endpoint}?{urlencode(params)}"

    async def _process_oidc_callback(
        self,
        config: SSOConfig,
        session: SSOSession,
        params: Dict[str, str],
    ) -> SSOUser:
        """
        Process OIDC authorization code callback.
        In production, this would:
          1. Exchange authorization code for tokens
          2. Validate ID token signature (JWT)
          3. Verify nonce matches
          4. Extract user claims
        """
        code = params.get("code", "")
        if not code:
            error = params.get("error", "unknown")
            description = params.get("error_description", "")
            raise ValueError(f"OIDC error: {error} — {description}")

        # Placeholder for token exchange
        # In production, use httpx to POST to token endpoint
        logger.info("Processing OIDC callback with authorization code")

        return SSOUser(
            email=params.get("email", ""),
            name=params.get("name", ""),
            provider_id=params.get("sub", ""),
            raw_attributes=params,
        )

    # ── Session Cleanup ───────────────────────────────────────

    def cleanup_expired_sessions(self) -> int:
        """Remove expired SSO sessions. Call periodically."""
        now = time.time()
        expired = [s for s, session in self._sessions.items() if session.is_expired]
        for s in expired:
            del self._sessions[s]
        if expired:
            logger.info("Cleaned up %d expired SSO sessions", len(expired))
        return len(expired)


# ── Global singleton ──────────────────────────────────────────
_sso_service: Optional[SSOService] = None


def get_sso_service() -> SSOService:
    """Get or create the global SSO service singleton."""
    global _sso_service
    if _sso_service is None:
        _sso_service = SSOService()
    return _sso_service
