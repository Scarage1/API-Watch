"""API v1 routes package."""
from fastapi import APIRouter
from .auth_routes import router as auth_router
from .collections_routes import router as collections_router
from .environments_routes import router as environments_router
from .history_routes import router as history_router
from .mock_routes import router as mock_router, mock_catch_router
from .org_routes import router as org_router
from .workspace_routes import router as workspace_router
from .invitation_routes import router as invitation_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth_router)
api_v1_router.include_router(collections_router)
api_v1_router.include_router(environments_router)
api_v1_router.include_router(history_router)
api_v1_router.include_router(mock_router)
api_v1_router.include_router(org_router)
api_v1_router.include_router(workspace_router)
api_v1_router.include_router(invitation_router)
