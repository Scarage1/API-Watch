"""
Postman Collection v2.1 importer/exporter.

Handles bidirectional conversion between API-Watch collections and
Postman Collection Format v2.1.0.
"""
from typing import Optional, List, Dict, Any


# ── Postman → API-Watch ──────────────────────────────────────────────────────

def import_postman_v2(data: dict) -> dict:
    """Convert a Postman Collection v2.1 JSON into API-Watch format.

    Returns dict with:
        name: str
        description: str | None
        requests: list[dict]  — each with name, method, url, headers, params, body, ...
    """
    info = data.get("info", {})
    collection_name = info.get("name", "Imported Collection")
    collection_desc = info.get("description")

    requests = []
    _flatten_items(data.get("item", []), requests, sort_start=0)

    return {
        "name": collection_name,
        "description": collection_desc,
        "requests": requests,
    }


def _flatten_items(items: list, output: list, sort_start: int, folder_prefix: str = "") -> int:
    """Recursively flatten Postman items (folders + requests) into a flat list."""
    order = sort_start
    for item in items:
        if "item" in item:
            # It's a folder — recurse
            prefix = f"{folder_prefix}{item.get('name', '')}/"
            order = _flatten_items(item["item"], output, order, prefix)
        elif "request" in item:
            req = item["request"]
            parsed = _parse_request(item.get("name", "Unnamed"), req, order, folder_prefix)
            output.append(parsed)
            order += 1
    return order


def _parse_request(name: str, req: dict, sort_order: int, folder_prefix: str) -> dict:
    """Parse a single Postman request into API-Watch format."""
    # URL handling
    url_data = req.get("url", "")
    if isinstance(url_data, dict):
        raw_url = url_data.get("raw", "")
        # Extract query params
        params = {}
        for qp in url_data.get("query", []):
            if not qp.get("disabled"):
                params[qp.get("key", "")] = qp.get("value", "")
    elif isinstance(url_data, str):
        raw_url = url_data
        params = {}
    else:
        raw_url = str(url_data)
        params = {}

    # Headers
    headers = {}
    for h in req.get("header", []):
        if not h.get("disabled"):
            headers[h.get("key", "")] = h.get("value", "")

    # Body
    body = None
    body_type = "none"
    body_data = req.get("body")
    if body_data:
        mode = body_data.get("mode", "")
        if mode == "raw":
            body = body_data.get("raw", "")
            raw_lang = (body_data.get("options", {}).get("raw", {}).get("language", "json"))
            body_type = "json" if raw_lang == "json" else "text"
        elif mode == "formdata":
            body = _encode_form_data(body_data.get("formdata", []))
            body_type = "form"
        elif mode == "urlencoded":
            body = _encode_form_data(body_data.get("urlencoded", []))
            body_type = "form"

    # Auth
    auth_config = None
    auth_data = req.get("auth")
    if auth_data:
        auth_config = _parse_auth(auth_data)

    display_name = f"{folder_prefix}{name}" if folder_prefix else name

    return {
        "name": display_name,
        "method": req.get("method", "GET").upper(),
        "url": raw_url,
        "headers": headers,
        "params": params,
        "body": body,
        "body_type": body_type,
        "auth_config": auth_config,
        "timeout": 10,
        "sort_order": sort_order,
    }


def _encode_form_data(items: list) -> str:
    """Convert Postman form-data to URL-encoded string."""
    import json
    pairs = {}
    for item in items:
        if not item.get("disabled"):
            pairs[item.get("key", "")] = item.get("value", "")
    return json.dumps(pairs)


def _parse_auth(auth_data: dict) -> Optional[dict]:
    """Parse Postman auth into API-Watch auth_config format."""
    auth_type = auth_data.get("type", "")
    if auth_type == "bearer":
        tokens = auth_data.get("bearer", [])
        token_val = ""
        for t in tokens:
            if t.get("key") == "token":
                token_val = t.get("value", "")
        return {"type": "bearer", "token": token_val}
    elif auth_type == "basic":
        basic = auth_data.get("basic", [])
        username = password = ""
        for b in basic:
            if b.get("key") == "username":
                username = b.get("value", "")
            elif b.get("key") == "password":
                password = b.get("value", "")
        return {"type": "basic", "username": username, "password": password}
    elif auth_type == "apikey":
        apikey = auth_data.get("apikey", [])
        key = value = ""
        in_loc = "header"
        for a in apikey:
            if a.get("key") == "key":
                key = a.get("value", "")
            elif a.get("key") == "value":
                value = a.get("value", "")
            elif a.get("key") == "in":
                in_loc = a.get("value", "header")
        return {"type": "apikey", "key": key, "value": value, "in": in_loc}
    return None


# ── API-Watch → Postman ──────────────────────────────────────────────────────

def export_postman_v2(
    collection_name: str,
    description: Optional[str],
    requests: List[dict],
) -> dict:
    """Convert API-Watch collection + requests into Postman Collection v2.1 format."""
    items = []
    for req in sorted(requests, key=lambda r: r.get("sort_order", 0)):
        item = _build_postman_item(req)
        items.append(item)

    return {
        "info": {
            "name": collection_name,
            "description": description or "",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": items,
    }


def _build_postman_item(req: dict) -> dict:
    """Build a single Postman item from an API-Watch request."""
    # Headers
    headers_list = [
        {"key": k, "value": v, "type": "text"}
        for k, v in (req.get("headers") or {}).items()
    ]

    # URL with query params
    url_obj: Dict[str, Any] = {"raw": req.get("url", "")}
    params = req.get("params") or {}
    if params:
        url_obj["query"] = [
            {"key": k, "value": v} for k, v in params.items()
        ]

    # Body
    body_obj = None
    body_type = req.get("body_type", "none")
    body_content = req.get("body")
    if body_content and body_type != "none":
        if body_type == "json":
            body_obj = {
                "mode": "raw",
                "raw": body_content,
                "options": {"raw": {"language": "json"}},
            }
        elif body_type == "form":
            try:
                import json
                pairs = json.loads(body_content)
                body_obj = {
                    "mode": "urlencoded",
                    "urlencoded": [{"key": k, "value": v, "type": "text"} for k, v in pairs.items()],
                }
            except Exception:
                body_obj = {"mode": "raw", "raw": body_content}
        else:
            body_obj = {"mode": "raw", "raw": body_content}

    # Auth
    auth_obj = None
    auth_config = req.get("auth_config")
    if auth_config:
        auth_obj = _build_postman_auth(auth_config)

    request_obj: Dict[str, Any] = {
        "method": req.get("method", "GET"),
        "header": headers_list,
        "url": url_obj,
    }
    if body_obj:
        request_obj["body"] = body_obj
    if auth_obj:
        request_obj["auth"] = auth_obj

    return {
        "name": req.get("name", "Unnamed"),
        "request": request_obj,
        "response": [],
    }


def _build_postman_auth(auth_config: dict) -> Optional[dict]:
    """Build Postman auth object from API-Watch auth_config."""
    auth_type = auth_config.get("type", "")
    if auth_type == "bearer":
        return {
            "type": "bearer",
            "bearer": [{"key": "token", "value": auth_config.get("token", ""), "type": "string"}],
        }
    elif auth_type == "basic":
        return {
            "type": "basic",
            "basic": [
                {"key": "username", "value": auth_config.get("username", ""), "type": "string"},
                {"key": "password", "value": auth_config.get("password", ""), "type": "string"},
            ],
        }
    return None
