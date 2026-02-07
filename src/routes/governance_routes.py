"""
API governance routes — rule management, request/collection scanning,
secret scanning, and governance reports.
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..jwt_auth import get_current_user
from ..models import User
from ..governance import GovernanceChecker, BUILTIN_RULES
from ..secret_scanner import scan_request, scan_environment, get_patterns_summary

router = APIRouter(prefix="/governance", tags=["Governance"])

# Module-level checker (singleton)
_checker = GovernanceChecker()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ScanRequestPayload(BaseModel):
    name: str = ""
    method: str = "GET"
    url: str = ""
    headers: Optional[Dict[str, str]] = None
    body: Optional[Any] = None
    auth_config: Optional[Dict[str, str]] = None


class ScanCollectionPayload(BaseModel):
    name: str = ""
    requests: Optional[List[Dict[str, Any]]] = None


class ScanEnvironmentPayload(BaseModel):
    name: str = "environment"
    variables: Dict[str, str] = {}


class RuleTogglePayload(BaseModel):
    enabled: bool


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/rules")
async def list_rules(user: User = Depends(get_current_user)):
    """Return all governance rules with their enabled state."""
    return {"rules": _checker.get_rules()}


@router.patch("/rules/{rule_id}")
async def toggle_rule(
    rule_id: str,
    payload: RuleTogglePayload,
    user: User = Depends(get_current_user),
):
    """Enable or disable a governance rule."""
    if payload.enabled:
        ok = _checker.enable_rule(rule_id)
    else:
        ok = _checker.disable_rule(rule_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")
    return {"rule_id": rule_id, "enabled": payload.enabled}


@router.post("/scan/request")
async def scan_single_request(
    payload: ScanRequestPayload,
    user: User = Depends(get_current_user),
):
    """
    Scan a single API request against governance rules AND secret patterns.
    Returns combined governance report + secret findings.
    """
    # Governance rules
    report = _checker.check_request(
        name=payload.name,
        method=payload.method,
        url=payload.url,
        headers=payload.headers,
        body=payload.body,
        auth_config=payload.auth_config,
    )

    # Secret scanning
    headers = payload.headers or {}
    secrets = scan_request(
        url=payload.url,
        method=payload.method,
        headers=headers,
        body=payload.body,
        auth_config=payload.auth_config,
    )

    return {
        "governance": report.to_dict(),
        "secrets": [s.to_dict() for s in secrets],
        "secret_count": len(secrets),
    }


@router.post("/scan/collection")
async def scan_collection(
    payload: ScanCollectionPayload,
    user: User = Depends(get_current_user),
):
    """Scan a full collection against governance rules."""
    report = _checker.check_collection(
        name=payload.name,
        requests=payload.requests,
    )
    return {"governance": report.to_dict()}


@router.post("/scan/environment")
async def scan_env(
    payload: ScanEnvironmentPayload,
    user: User = Depends(get_current_user),
):
    """Scan environment variables for naming convention violations and secrets."""
    report = _checker.check_environment(
        variables=payload.variables,
        env_name=payload.name,
    )
    secrets = scan_environment(payload.variables)
    return {
        "governance": report.to_dict(),
        "secrets": [s.to_dict() for s in secrets],
        "secret_count": len(secrets),
    }


@router.get("/patterns")
async def list_secret_patterns(user: User = Depends(get_current_user)):
    """Return all secret-scanning regex patterns for UI display."""
    return {"patterns": get_patterns_summary()}
