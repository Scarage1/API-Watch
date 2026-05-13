"""API v1 routes package."""

from fastapi import APIRouter

from .activity_routes import router as activity_router
from .apikey_routes import router as apikey_router
from .audit_routes import router as audit_router
from .auth_routes import router as auth_router
from .collections_routes import router as collections_router
from .environments_routes import router as environments_router
from .governance_routes import router as governance_router
from .history_routes import router as history_router
from .import_export_routes import router as import_export_router
from .invitation_routes import router as invitation_router
from .mock_routes import mock_catch_router
from .mock_routes import router as mock_router
from .monitor_routes import router as monitor_router
from .notification_routes import router as notification_router
from .oauth_routes import router as oauth_router
from .observability_routes import router as observability_router
from .org_routes import router as org_router
from .sharing_routes import router as sharing_router
from .versioning_routes import router as versioning_router
from .workspace_routes import router as workspace_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth_router)
# Sharing & versioning before collections so /collections/shared doesn't
# collide with /collections/{collection_id}
api_v1_router.include_router(sharing_router)
api_v1_router.include_router(versioning_router)
api_v1_router.include_router(collections_router)
api_v1_router.include_router(environments_router)
api_v1_router.include_router(history_router)
api_v1_router.include_router(mock_router)
api_v1_router.include_router(org_router)
api_v1_router.include_router(workspace_router)
api_v1_router.include_router(invitation_router)
api_v1_router.include_router(activity_router)
api_v1_router.include_router(monitor_router)
api_v1_router.include_router(notification_router)
api_v1_router.include_router(apikey_router)
api_v1_router.include_router(import_export_router)
api_v1_router.include_router(oauth_router)
api_v1_router.include_router(audit_router)
api_v1_router.include_router(governance_router)
api_v1_router.include_router(observability_router)
