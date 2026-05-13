"""
OpenAPI 3.0 exporter.

Converts an API-Watch collection (with saved requests) into an
OpenAPI 3.0.3 specification document.
"""

from typing import Any
from urllib.parse import urlparse


def export_openapi(
    collection_name: str,
    description: str | None,
    requests: list[dict],
    version: str = "1.0.0",
) -> dict:
    """Convert API-Watch collection requests into an OpenAPI 3.0.3 spec.

    Args:
        collection_name: Name of the collection
        description: Collection description
        requests: List of saved request dicts (name, method, url, headers, params, body, body_type)
        version: API version string

    Returns:
        OpenAPI 3.0.3 specification dict
    """
    # Group requests by path
    paths: dict[str, dict[str, Any]] = {}
    servers: dict[str, bool] = {}

    for req in sorted(requests, key=lambda r: r.get("sort_order", 0)):
        parsed = urlparse(req.get("url", ""))
        base_url = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme else ""
        path = parsed.path or "/"

        if base_url:
            servers[base_url] = True

        method = req.get("method", "GET").lower()
        operation = _build_operation(req)

        if path not in paths:
            paths[path] = {}
        paths[path][method] = operation

    # Build servers list (deduplicated)
    server_list = (
        [{"url": url} for url in servers.keys()] if servers else [{"url": "http://localhost"}]
    )

    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": collection_name,
            "description": description or "",
            "version": version,
        },
        "servers": server_list,
        "paths": paths,
    }

    return spec


def _build_operation(req: dict) -> dict:
    """Build an OpenAPI operation object from an API-Watch request."""
    operation: dict[str, Any] = {
        "summary": req.get("name", ""),
        "operationId": _to_operation_id(req.get("name", ""), req.get("method", "GET")),
        "responses": {
            "200": {"description": "Successful response"},
        },
    }

    # Query parameters
    params = req.get("params") or {}
    if params:
        operation["parameters"] = [
            {
                "name": key,
                "in": "query",
                "required": False,
                "schema": {"type": "string"},
                "example": value,
            }
            for key, value in params.items()
        ]

    # Headers (skip standard ones)
    headers = req.get("headers") or {}
    skip_headers = {"content-type", "accept", "authorization", "user-agent"}
    header_params = [
        {
            "name": key,
            "in": "header",
            "required": False,
            "schema": {"type": "string"},
            "example": value,
        }
        for key, value in headers.items()
        if key.lower() not in skip_headers
    ]
    if header_params:
        if "parameters" not in operation:
            operation["parameters"] = []
        operation["parameters"].extend(header_params)

    # Request body
    body = req.get("body")
    body_type = req.get("body_type", "none")
    if body and body_type != "none":
        content_type = _body_type_to_media(body_type)
        request_body: dict[str, Any] = {
            "required": True,
            "content": {
                content_type: {
                    "schema": {"type": "object"},
                },
            },
        }
        # Try to add example
        if body_type == "json":
            try:
                import json

                request_body["content"][content_type]["example"] = json.loads(body)
            except Exception:
                request_body["content"][content_type]["example"] = body
        else:
            request_body["content"][content_type]["example"] = body

        operation["requestBody"] = request_body

    # Security
    auth_config = req.get("auth_config")
    if auth_config:
        auth_type = auth_config.get("type", "")
        if auth_type == "bearer":
            operation["security"] = [{"bearerAuth": []}]
        elif auth_type == "basic":
            operation["security"] = [{"basicAuth": []}]

    return operation


def _to_operation_id(name: str, method: str) -> str:
    """Generate a camelCase operation ID from request name and method."""
    import re

    # Remove special chars, split to words
    words = re.split(r"[^a-zA-Z0-9]+", name.strip())
    words = [w for w in words if w]
    if not words:
        return method.lower()
    # camelCase
    result = words[0].lower()
    for w in words[1:]:
        result += w.capitalize()
    return result


def _body_type_to_media(body_type: str) -> str:
    """Map API-Watch body_type to media type."""
    mapping = {
        "json": "application/json",
        "form": "application/x-www-form-urlencoded",
        "text": "text/plain",
        "xml": "application/xml",
    }
    return mapping.get(body_type, "application/octet-stream")
