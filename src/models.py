"""
Database models for API-Watch.
Defines User, Collection, SavedRequest, Environment, and RequestHistory.
"""
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime, ForeignKey, JSON, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    """User account."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    collections: Mapped[List["Collection"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    environments: Mapped[List["Environment"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    history: Mapped[List["RequestHistory"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Collection(Base):
    """A collection groups saved requests (like Postman collections)."""
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="collections")
    requests: Mapped[List["SavedRequest"]] = relationship(back_populates="collection", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_collections_owner", "owner_id"),
    )


class SavedRequest(Base):
    """A saved API request within a collection."""
    __tablename__ = "saved_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    url: Mapped[str] = mapped_column(Text, nullable=False)
    headers: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    params: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body_type: Mapped[str] = mapped_column(String(20), default="json")  # json, form, text, none
    auth_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    timeout: Mapped[int] = mapped_column(Integer, default=10)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    collection_id: Mapped[str] = mapped_column(String(36), ForeignKey("collections.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    collection: Mapped["Collection"] = relationship(back_populates="requests")

    __table_args__ = (
        Index("ix_saved_requests_collection", "collection_id"),
    )


class Environment(Base):
    """Named set of variables (like Postman environments)."""
    __tablename__ = "environments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    variables: Mapped[dict] = mapped_column(JSON, default=dict)  # {"key": "value", ...}
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="environments")

    __table_args__ = (
        Index("ix_environments_owner", "owner_id"),
    )


class RequestHistory(Base):
    """Record of an executed API request."""
    __tablename__ = "request_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    # Request details
    request_method: Mapped[str] = mapped_column(String(10), nullable=False)
    request_url: Mapped[str] = mapped_column(Text, nullable=False)
    request_headers: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    request_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Response details
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_time: Mapped[float] = mapped_column(Float, default=0.0)
    response_size: Mapped[int] = mapped_column(Integer, default=0)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_headers: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Metadata
    collection_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    saved_request_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="history")

    __table_args__ = (
        Index("ix_history_owner_timestamp", "owner_id", "timestamp"),
    )
