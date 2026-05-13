"""
Enterprise API Routes for API-Watch.

Endpoints:
  /api/v1/enterprise/sso           — SSO configuration & login flows
  /api/v1/enterprise/audit         — Audit log queries & export
  /api/v1/enterprise/compliance    — Compliance report generation
  /api/v1/enterprise/collaboration — Collaboration stats & WebSocket
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .audit import (
    AuditEvent,
    AuditSeverity,
    ComplianceFramework,
    RetentionPolicy,
    get_audit_service,
)
from .collaboration import get_collaboration_hub
from .sso import SSOConfig, SSOProvider, SSOStatus, get_sso_service

logger = logging.getLogger("apiwatch.enterprise.routes")

router = APIRouter(prefix="/api/v1/enterprise", tags=["enterprise"])


# ── Request/Response Models ───────────────────────────────────


class SSOConfigRequest(BaseModel):
    """Request to create/update SSO configuration."""

    organization_id: str
    provider: str = "oidc"  # "saml" or "oidc"
    display_name: str = ""
    allowed_domains: list[str] = []
    enforce_sso: bool = False
    auto_create_users: bool = True
    default_role: str = "member"
    # SAML
    saml_entity_id: str = ""
    saml_sso_url: str = ""
    saml_slo_url: str = ""
    saml_certificate: str = ""
    # OIDC
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_issuer_url: str = ""
    oidc_scopes: list[str] = ["openid", "email", "profile"]
    oidc_redirect_uri: str = ""


class SSOLoginRequest(BaseModel):
    """Request to initiate SSO login."""

    organization_id: str
    redirect_url: str = "/"


class SSOCallbackRequest(BaseModel):
    """SSO callback parameters."""

    state: str
    code: str = ""  # OIDC authorization code
    SAMLResponse: str = ""  # SAML response


class AuditSearchRequest(BaseModel):
    """Audit log search parameters."""

    organization_id: str | None = None
    category: str | None = None
    action: str | None = None
    user_id: str | None = None
    severity: str | None = None
    start_time: float | None = None
    end_time: float | None = None
    limit: int = Field(default=50, le=500)
    offset: int = 0


class ComplianceReportRequest(BaseModel):
    """Request to generate a compliance report."""

    organization_id: str
    framework: str  # soc2, gdpr, hipaa, iso27001


class RetentionPolicyRequest(BaseModel):
    """Request to set data retention policy."""

    policy: str  # 30d, 90d, 365d, unlimited


# ══════════════════════════════════════════════════════════════
# SSO Routes
# ══════════════════════════════════════════════════════════════


@router.get("/sso/{organization_id}")
async def get_sso_config(organization_id: str):
    """Get SSO configuration for an organization."""
    sso = get_sso_service()
    config = sso.get_config(organization_id)
    if not config:
        return {"configured": False, "organization_id": organization_id}
    return {"configured": True, **config.to_dict()}


@router.post("/sso/configure")
async def configure_sso(request: SSOConfigRequest):
    """Create or update SSO configuration."""
    sso = get_sso_service()

    try:
        provider = SSOProvider(request.provider)
    except ValueError:
        raise HTTPException(400, f"Invalid provider: {request.provider}")

    config = SSOConfig(
        organization_id=request.organization_id,
        provider=provider,
        status=SSOStatus.TESTING,  # Start in testing mode
        display_name=request.display_name,
        allowed_domains=request.allowed_domains,
        enforce_sso=request.enforce_sso,
        auto_create_users=request.auto_create_users,
        default_role=request.default_role,
        saml_entity_id=request.saml_entity_id,
        saml_sso_url=request.saml_sso_url,
        saml_slo_url=request.saml_slo_url,
        saml_certificate=request.saml_certificate,
        oidc_client_id=request.oidc_client_id,
        oidc_client_secret=request.oidc_client_secret,
        oidc_issuer_url=request.oidc_issuer_url,
        oidc_scopes=request.oidc_scopes,
        oidc_redirect_uri=request.oidc_redirect_uri,
    )

    sso.register_config(config)

    # Log audit event
    audit = get_audit_service()
    await audit.log(
        AuditEvent(
            category="admin",
            action="sso_configured",
            severity=AuditSeverity.INFO,
            resource_type="organization",
            resource_id=request.organization_id,
            details={"provider": provider.value, "enforce_sso": request.enforce_sso},
        )
    )

    return {"status": "configured", "provider": provider.value, **config.to_dict()}


@router.post("/sso/activate/{organization_id}")
async def activate_sso(organization_id: str):
    """Activate SSO for an organization (move from testing → active)."""
    sso = get_sso_service()
    config = sso.get_config(organization_id)
    if not config:
        raise HTTPException(404, "SSO not configured for this organization")

    config.status = SSOStatus.ACTIVE
    sso.register_config(config)

    audit = get_audit_service()
    await audit.log(
        AuditEvent(
            category="admin",
            action="sso_activated",
            severity=AuditSeverity.WARNING,
            resource_type="organization",
            resource_id=organization_id,
            details={"enforce_sso": config.enforce_sso},
        )
    )

    return {"status": "active", "organization_id": organization_id}


@router.post("/sso/login")
async def initiate_sso_login(request: SSOLoginRequest):
    """Initiate SSO login flow — returns redirect URL to IdP."""
    sso = get_sso_service()
    try:
        result = await sso.initiate_login(
            organization_id=request.organization_id,
            redirect_url=request.redirect_url,
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/sso/callback")
async def sso_callback(request: SSOCallbackRequest):
    """Process SSO callback from Identity Provider."""
    sso = get_sso_service()

    params = {}
    if request.code:
        params["code"] = request.code
    if request.SAMLResponse:
        params["SAMLResponse"] = request.SAMLResponse

    try:
        user = await sso.process_callback(state=request.state, params=params)

        audit = get_audit_service()
        await audit.log(
            AuditEvent(
                category="auth",
                action="sso_login",
                severity=AuditSeverity.INFO,
                user_email=user.email,
                details={"provider_id": user.provider_id, "groups": user.groups},
            )
        )

        return {
            "status": "authenticated",
            "user": {
                "email": user.email,
                "name": user.name,
                "provider_id": user.provider_id,
            },
        }
    except ValueError as e:
        audit = get_audit_service()
        await audit.log(
            AuditEvent(
                category="auth",
                action="sso_login_failed",
                severity=AuditSeverity.WARNING,
                details={"error": str(e)},
            )
        )
        raise HTTPException(400, str(e))


# ══════════════════════════════════════════════════════════════
# Audit Routes
# ══════════════════════════════════════════════════════════════


@router.post("/audit/search")
async def search_audit_logs(request: AuditSearchRequest):
    """Search and filter audit logs."""
    audit = get_audit_service()

    severity = None
    if request.severity:
        try:
            severity = AuditSeverity(request.severity)
        except ValueError:
            raise HTTPException(400, f"Invalid severity: {request.severity}")

    events, total = await audit.search(
        organization_id=request.organization_id,
        category=request.category,
        action=request.action,
        user_id=request.user_id,
        severity=severity,
        start_time=request.start_time,
        end_time=request.end_time,
        limit=request.limit,
        offset=request.offset,
    )

    return {
        "events": [e.to_dict() for e in events],
        "total": total,
        "limit": request.limit,
        "offset": request.offset,
    }


@router.get("/audit/export/{organization_id}")
async def export_audit_logs(
    organization_id: str,
    format: str = Query("json", regex="^(json|csv)$"),
    start_time: float | None = None,
    end_time: float | None = None,
):
    """Export audit logs in JSON or CSV format."""
    audit = get_audit_service()

    if format == "json":
        content = await audit.export_json(organization_id, start_time, end_time)
        return {"format": "json", "data": json.loads(content)}
    elif format == "csv":
        content = await audit.export_csv(organization_id, start_time, end_time)
        return {"format": "csv", "data": content}


@router.get("/audit/integrity")
async def verify_audit_integrity():
    """Verify audit log hash chain integrity."""
    audit = get_audit_service()
    result = await audit.verify_chain_integrity()
    return result


@router.post("/audit/retention")
async def set_retention_policy(request: RetentionPolicyRequest):
    """Set audit log data retention policy."""
    audit = get_audit_service()
    try:
        policy = RetentionPolicy(request.policy)
    except ValueError:
        raise HTTPException(
            400, f"Invalid policy: {request.policy}. Use: 30d, 90d, 365d, unlimited"
        )

    audit.set_retention_policy(policy)
    return {"status": "updated", "policy": policy.value}


# ══════════════════════════════════════════════════════════════
# Compliance Routes
# ══════════════════════════════════════════════════════════════


@router.post("/compliance/report")
async def generate_compliance_report(request: ComplianceReportRequest):
    """Generate a compliance report for a framework."""
    audit = get_audit_service()

    try:
        framework = ComplianceFramework(request.framework)
    except ValueError:
        raise HTTPException(
            400, f"Invalid framework: {request.framework}. Use: soc2, gdpr, hipaa, iso27001"
        )

    report = await audit.generate_compliance_report(
        organization_id=request.organization_id,
        framework=framework,
    )
    return report.to_dict()


@router.get("/compliance/frameworks")
async def list_compliance_frameworks():
    """List available compliance frameworks."""
    return {
        "frameworks": [
            {"id": "soc2", "name": "SOC 2 Type II", "description": "Service Organization Controls"},
            {"id": "gdpr", "name": "GDPR", "description": "General Data Protection Regulation"},
            {
                "id": "hipaa",
                "name": "HIPAA",
                "description": "Health Insurance Portability and Accountability Act",
            },
            {
                "id": "iso27001",
                "name": "ISO 27001",
                "description": "Information Security Management",
            },
        ]
    }


# ══════════════════════════════════════════════════════════════
# Collaboration Routes
# ══════════════════════════════════════════════════════════════


@router.get("/collaboration/stats")
async def get_collaboration_stats():
    """Get real-time collaboration statistics."""
    hub = get_collaboration_hub()
    return hub.get_stats()


@router.get("/collaboration/room/{workspace_id}")
async def get_room_info(workspace_id: str):
    """Get collaboration room info for a workspace."""
    hub = get_collaboration_hub()
    info = hub.get_room_info(workspace_id)
    if not info:
        return {"workspace_id": workspace_id, "active_users": 0, "members": []}
    return info


@router.websocket("/collaboration/ws/{workspace_id}")
async def collaboration_websocket(websocket: WebSocket, workspace_id: str):
    """
    WebSocket endpoint for real-time collaboration.

    Connect: ws://host/api/v1/enterprise/collaboration/ws/{workspace_id}
    Send user info as first message after connection.
    """
    await websocket.accept()

    try:
        # Wait for initial identification message
        raw = await websocket.receive_text()
        user_info = json.loads(raw)

        if "user_id" not in user_info:
            await websocket.send_text(json.dumps({"error": "user_id required"}))
            await websocket.close()
            return

        hub = get_collaboration_hub()
        await hub.handle_connection(websocket, workspace_id, user_info)

    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected for workspace %s", workspace_id)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        try:
            await websocket.close()
        except Exception:
            pass
