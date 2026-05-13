"""
Authentication routes — register, login, refresh, profile, logout.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..jwt_auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    blacklist_token,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..models import User, Workspace, WorkspaceMember, WorkspaceRole

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new user account."""
    existing = await db.execute(
        select(User).where(or_(User.email == body.email, User.username == body.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered",
        )

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    # Auto-create personal workspace
    personal_ws = Workspace(
        name=f"{body.username}'s Workspace",
        is_personal=True,
    )
    db.add(personal_ws)
    await db.flush()

    ws_member = WorkspaceMember(
        workspace_id=personal_ws.id,
        user_id=user.id,
        role=WorkspaceRole.ADMIN,
    )
    db.add(ws_member)

    user.default_workspace_id = personal_ws.id

    await db.commit()
    await db.refresh(user)

    access = create_access_token(user.id, user.username)
    refresh = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user={
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "default_workspace_id": user.default_workspace_id,
        },
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate and get tokens."""
    result = await db.execute(
        select(User).where(or_(User.username == body.username, User.email == body.username))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    access = create_access_token(user.id, user.username)
    refresh = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user={
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "default_workspace_id": user.default_workspace_id,
        },
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Get new access token using refresh token."""
    payload = decode_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    access = create_access_token(user.id, user.username)
    refresh = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user={
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "default_workspace_id": user.default_workspace_id,
        },
    )


@router.get("/me")
async def get_profile(user: User = Depends(get_current_user)):
    """Get current user profile."""
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "default_workspace_id": user.default_workspace_id,
        "created_at": user.created_at.isoformat(),
    }


_security = HTTPBearer()


@router.post("/logout", status_code=200)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
):
    """Logout — revoke the current access token."""
    payload = decode_token(credentials.credentials)
    jti = payload.get("jti")
    if not jti:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token does not contain a JTI claim",
        )
    # Blacklist the token for its remaining lifetime
    exp = payload.get("exp", 0)
    import time

    remaining = max(int(exp - time.time()), 60)  # at least 60s
    await blacklist_token(jti, ttl=remaining)
    return {"detail": "Successfully logged out"}
