"""
Tests for utility functions.
"""
import sys
from pathlib import Path

# Ensure project root is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from src.utils import (
    format_bytes,
    format_duration,
    safe_json_parse,
    safe_json_dump,
    truncate_string,
    sanitize_filename,
    merge_dicts,
    get_timestamp,
    get_iso_timestamp,
    ensure_directory,
    get_env_var,
    load_env,
)


class TestFormatBytes:
    def test_bytes(self):
        assert format_bytes(500) == "500.00 B"

    def test_kilobytes(self):
        assert format_bytes(1536) == "1.50 KB"

    def test_megabytes(self):
        assert format_bytes(1048576) == "1.00 MB"

    def test_zero(self):
        assert format_bytes(0) == "0.00 B"

    def test_gigabytes(self):
        assert "GB" in format_bytes(2 * 1024**3)

    def test_terabytes(self):
        assert "TB" in format_bytes(2 * 1024**4)


class TestFormatDuration:
    def test_milliseconds(self):
        assert format_duration(0.250) == "250ms"

    def test_seconds(self):
        assert format_duration(2.5) == "2.50s"

    def test_zero(self):
        assert format_duration(0) == "0ms"

    def test_exact_one_second(self):
        assert format_duration(1.0) == "1.00s"

    def test_sub_millisecond(self):
        result = format_duration(0.0005)
        assert result == "0ms" or result == "1ms"


class TestSafeJsonParse:
    def test_valid_json(self):
        result = safe_json_parse('{"key": "value"}')
        assert result == {"key": "value"}

    def test_invalid_json(self):
        result = safe_json_parse("not json")
        assert result is None

    def test_none_input(self):
        result = safe_json_parse(None)
        assert result is None

    def test_empty_string(self):
        result = safe_json_parse("")
        assert result is None

    def test_array_json(self):
        result = safe_json_parse('[1, 2, 3]')
        assert result == [1, 2, 3]


class TestSafeJsonDump:
    def test_valid_data(self):
        result = safe_json_dump({"key": "value"})
        assert '"key"' in result
        assert '"value"' in result

    def test_non_serializable_uses_str(self):
        # default=str should handle non-serializable types
        result = safe_json_dump({"path": Path("/tmp")})
        assert "/tmp" in result

    def test_indent(self):
        result = safe_json_dump({"a": 1}, indent=4)
        assert "    " in result


class TestTruncateString:
    def test_short_string(self):
        assert truncate_string("hello", 10) == "hello"

    def test_long_string(self):
        result = truncate_string("a" * 200, 100)
        assert len(result) == 100
        assert result.endswith("...")

    def test_exact_length(self):
        assert truncate_string("hello", 5) == "hello"

    def test_default_max_length(self):
        short = "short"
        assert truncate_string(short) == short


class TestSanitizeFilename:
    def test_removes_invalid_chars(self):
        result = sanitize_filename('file<>:"/\\|?*.txt')
        assert "<" not in result
        assert ">" not in result
        assert ":" not in result
        assert "?" not in result
        assert "*" not in result

    def test_clean_filename(self):
        assert sanitize_filename("clean_name.txt") == "clean_name.txt"

    def test_replaces_with_underscore(self):
        result = sanitize_filename("a<b")
        assert result == "a_b"


class TestMergeDicts:
    def test_basic_merge(self):
        result = merge_dicts({"a": 1}, {"b": 2})
        assert result == {"a": 1, "b": 2}

    def test_override(self):
        result = merge_dicts({"a": 1}, {"a": 2})
        assert result == {"a": 2}

    def test_empty_override(self):
        result = merge_dicts({"a": 1}, {})
        assert result == {"a": 1}

    def test_does_not_mutate_original(self):
        base = {"a": 1}
        merge_dicts(base, {"b": 2})
        assert base == {"a": 1}


class TestTimestamps:
    def test_get_timestamp_format(self):
        ts = get_timestamp()
        assert len(ts) == 15  # YYYYMMDD_HHMMSS
        assert "_" in ts

    def test_get_iso_timestamp(self):
        iso = get_iso_timestamp()
        assert "T" in iso


class TestEnsureDirectory:
    def test_creates_directory(self, tmp_path):
        new_dir = str(tmp_path / "test_subdir")
        result = ensure_directory(new_dir)
        assert result.exists()
        assert result.is_dir()

    def test_existing_directory(self, tmp_path):
        result = ensure_directory(str(tmp_path))
        assert result.exists()

    def test_nested_directory(self, tmp_path):
        nested = str(tmp_path / "a" / "b" / "c")
        result = ensure_directory(nested)
        assert result.exists()


class TestGetEnvVar:
    def test_existing_var(self, monkeypatch):
        monkeypatch.setenv("TEST_VAR_XYZ", "hello")
        assert get_env_var("TEST_VAR_XYZ") == "hello"

    def test_missing_var_default(self):
        assert get_env_var("NONEXISTENT_VAR_12345", "fallback") == "fallback"

    def test_missing_var_none(self):
        assert get_env_var("NONEXISTENT_VAR_12345") is None
