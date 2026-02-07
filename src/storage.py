"""
Storage abstraction for API-Watch.

Provides a unified async interface for file storage with two backends:
  1. FileSystemStorage (default) — local filesystem
  2. AzureBlobStorage (production) — Azure Blob Storage

Selected via ``settings.storage_backend``.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class StorageBackend:
    """Abstract storage interface."""

    async def read(self, path: str) -> Optional[str]:
        raise NotImplementedError

    async def write(self, path: str, content: str) -> None:
        raise NotImplementedError

    async def delete(self, path: str) -> bool:
        raise NotImplementedError

    async def exists(self, path: str) -> bool:
        raise NotImplementedError

    async def list_files(self, prefix: str = "") -> list[str]:
        raise NotImplementedError

    async def close(self) -> None:
        pass


class FileSystemStorage(StorageBackend):
    """Local filesystem storage."""

    def __init__(self, root: str) -> None:
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)
        logger.info("Storage: filesystem backend at %s", self._root.resolve())

    def _resolve(self, path: str) -> Path:
        """Resolve and validate path (prevent traversal)."""
        full = (self._root / path).resolve()
        if not str(full).startswith(str(self._root.resolve())):
            raise ValueError(f"Path traversal attempt: {path}")
        return full

    async def read(self, path: str) -> Optional[str]:
        fp = self._resolve(path)
        if not fp.exists():
            return None
        return fp.read_text(encoding="utf-8")

    async def write(self, path: str, content: str) -> None:
        fp = self._resolve(path)
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content, encoding="utf-8")

    async def delete(self, path: str) -> bool:
        fp = self._resolve(path)
        if fp.exists():
            fp.unlink()
            return True
        return False

    async def exists(self, path: str) -> bool:
        return self._resolve(path).exists()

    async def list_files(self, prefix: str = "") -> list[str]:
        base = self._resolve(prefix) if prefix else self._root
        if not base.exists():
            return []
        root_str = str(self._root.resolve())
        return [
            str(p.resolve()).replace(root_str + os.sep, "").replace(os.sep, "/")
            for p in base.rglob("*")
            if p.is_file()
        ]


class AzureBlobStorage(StorageBackend):
    """Azure Blob Storage backend (lazy-imports azure SDK)."""

    def __init__(self, connection_string: str, container: str) -> None:
        from azure.storage.blob.aio import BlobServiceClient

        self._client = BlobServiceClient.from_connection_string(connection_string)
        self._container_name = container
        self._container_client = self._client.get_container_client(container)
        logger.info("Storage: Azure Blob backend (container=%s)", container)

    async def _ensure_container(self) -> None:
        try:
            await self._container_client.create_container()
        except Exception:
            pass  # already exists

    async def read(self, path: str) -> Optional[str]:
        try:
            blob = self._container_client.get_blob_client(path)
            data = await blob.download_blob()
            return (await data.readall()).decode("utf-8")
        except Exception:
            return None

    async def write(self, path: str, content: str) -> None:
        await self._ensure_container()
        blob = self._container_client.get_blob_client(path)
        await blob.upload_blob(content.encode("utf-8"), overwrite=True)

    async def delete(self, path: str) -> bool:
        try:
            blob = self._container_client.get_blob_client(path)
            await blob.delete_blob()
            return True
        except Exception:
            return False

    async def exists(self, path: str) -> bool:
        try:
            blob = self._container_client.get_blob_client(path)
            await blob.get_blob_properties()
            return True
        except Exception:
            return False

    async def list_files(self, prefix: str = "") -> list[str]:
        files = []
        async for blob in self._container_client.list_blobs(name_starts_with=prefix):
            files.append(blob.name)
        return files

    async def close(self) -> None:
        await self._client.close()


# ── Factory ──────────────────────────────────────────────────────────────────

_storage: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    """Return the global storage instance (lazy-initialized)."""
    global _storage
    if _storage is None:
        from .config import get_settings

        settings = get_settings()
        if settings.storage_backend == "azure_blob" and settings.azure_blob_connection_string:
            _storage = AzureBlobStorage(
                settings.azure_blob_connection_string,
                settings.azure_blob_container,
            )
        else:
            _storage = FileSystemStorage(settings.storage_root)
    return _storage


async def close_storage() -> None:
    """Gracefully shut down the storage backend."""
    global _storage
    if _storage is not None:
        await _storage.close()
        _storage = None


def reset_storage() -> None:
    """Reset storage instance (for testing)."""
    global _storage
    _storage = None
