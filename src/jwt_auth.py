"""
JWT Authentication for API-Watch users.
Handles registration, login, token creation/verification, and token blacklisting.
"""
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User

logger = logging.getLogger(__name__)

# --- Validation patterns ---
_PASSWORD_MIN_LENGTH = 8
_PASSWORD_PATTERN = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$')
_EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# Configuration — loaded from config module
def _load_config():
    from .config import get_settings
    return get_settings()

_settings = None
def _get_settings():
    global _settings
    if _settings is None:
        _settings = _load_config()
    return _settings

# Lazy accessors (defer import until first use to avoid circular imports at module load)
def _secret_key() -> str:
    return _get_settings().jwt_secret_key

def _algorithm() -> str:
    return _get_settings().jwt_algorithm

def _access_expire() -> int:
    return _get_settings().access_token_expire_minutes

def _refresh_expire() -> int:
    return _get_settings().refresh_token_expire_days

# Bearer token extractor
security = HTTPBearer(auto_error=False)


# --- Pydantic schemas ---

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_PATTERN.match(v):
            raise ValueError('Invalid email address format')
        return v

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < _PASSWORD_MIN_LENGTH:
            raise ValueError(f'Password must be at least {_PASSWORD_MIN_LENGTH} characters')
        if not _PASSWORD_PATTERN.match(v):
            raise ValueError('Password must contain at least one uppercase letter, one lowercase letter, and one digit')
        return v

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters')
        if len(v) > 50:
            raise ValueError('Username must be 50 characters or fewer')
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError('Username can only contain letters, numbers, hyphens, and underscores')
        return v


class LoginRequest(BaseModel):
    username: str  # accepts username or email
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


# --- Helper functions ---

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def create_access_token(user_id: str, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=_access_expire())
    payload = {
        "sub": user_id,
        "username": username,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "exp": expire,
    }
    return jwt.encode(payload, _secret_key(), algorithm=_algorithm())


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=_refresh_expire())
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "exp": expire,
    }
    return jwt.encode(payload, _secret_key(), algorithm=_algorithm())


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token."""
    try:
        return jwt.decode(token, _secret_key(), algorithms=[_algorithm()])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def blacklist_token(jti: str, ttl: Optional[int] = None) -> None:
    """Add a JTI to the blacklist (stored in cache/Redis)."""
    from .cache import get_cache

    cache = get_cache()
    # Default TTL = max token lifetime (refresh token days)
    if ttl is None:
        ttl = _refresh_expire() * 86400  # days → seconds
    await cache.set(f"blacklist:{jti}", "1", ttl=ttl)


async def is_token_blacklisted(jti: str) -> bool:
    """Check if a JTI has been revoked."""
    from .cache import get_cache

    cache = get_cache()
    return await cache.exists(f"blacklist:{jti}")


# --- FastAPI dependencies ---

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency — extracts and verifies user from JWT Bearer token."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    # Check if the token has been revoked (logout)
    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None if no token (for public endpoints)."""
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None
