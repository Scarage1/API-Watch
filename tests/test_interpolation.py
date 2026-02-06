"""
Tests for server-side environment variable interpolation.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from src.api_server import (
    interpolate_string,
    interpolate_dict,
    interpolate_body,
)


class TestInterpolateString:
    def test_replaces_known_variables(self):
        result = interpolate_string(
            "https://{{BASE_URL}}/users/{{USER_ID}}",
            {"BASE_URL": "api.example.com", "USER_ID": "42"},
        )
        assert result == "https://api.example.com/users/42"

    def test_leaves_unresolved_unchanged(self):
        result = interpolate_string(
            "{{BASE_URL}}/{{UNKNOWN}}",
            {"BASE_URL": "api.example.com"},
        )
        assert result == "api.example.com/{{UNKNOWN}}"

    def test_empty_string(self):
        assert interpolate_string("", {"A": "B"}) == ""

    def test_no_variables(self):
        assert interpolate_string("plain text", {"A": "B"}) == "plain text"

    def test_multiple_occurrences(self):
        result = interpolate_string("{{A}}-{{A}}", {"A": "x"})
        assert result == "x-x"

    def test_dynamic_timestamp(self):
        result = interpolate_string("ts={{$timestamp}}", {})
        assert result.startswith("ts=")
        assert result != "ts={{$timestamp}}"
        # Should be a number string
        int(result.split("=")[1])

    def test_dynamic_uuid(self):
        result = interpolate_string("id={{$randomUUID}}", {})
        assert "{{" not in result
        assert len(result) > 5

    def test_dynamic_email(self):
        result = interpolate_string("email={{$randomEmail}}", {})
        assert "@test.example.com" in result

    def test_user_vars_override_dynamic(self):
        """User-defined variables should take priority over dynamic ones."""
        result = interpolate_string(
            "{{$timestamp}}",
            {"$timestamp": "custom_value"},
        )
        assert result == "custom_value"


class TestInterpolateDict:
    def test_interpolates_keys_and_values(self):
        result = interpolate_dict(
            {"Authorization": "Bearer {{TOKEN}}", "X-User": "{{USER_ID}}"},
            {"TOKEN": "abc123", "USER_ID": "42"},
        )
        assert result == {"Authorization": "Bearer abc123", "X-User": "42"}

    def test_empty_dict(self):
        assert interpolate_dict({}, {"A": "B"}) == {}

    def test_no_variables_in_dict(self):
        result = interpolate_dict({"Key": "Value"}, {"A": "B"})
        assert result == {"Key": "Value"}


class TestInterpolateBody:
    def test_string_body(self):
        result = interpolate_body('{"token": "{{TOKEN}}"}', {"TOKEN": "abc"})
        assert result == '{"token": "abc"}'

    def test_dict_body(self):
        result = interpolate_body(
            {"user": "{{USER}}", "count": 5},
            {"USER": "john"},
        )
        assert result == {"user": "john", "count": 5}

    def test_none_body(self):
        assert interpolate_body(None, {"A": "B"}) is None

    def test_non_string_values_preserved(self):
        result = interpolate_body(
            {"num": 42, "flag": True, "text": "{{VAR}}"},
            {"VAR": "hello"},
        )
        assert result["num"] == 42
        assert result["flag"] is True
        assert result["text"] == "hello"
