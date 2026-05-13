"""
Tests for diagnosis engine.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from src.diagnose import Diagnosis, DiagnosisEngine
from src.runner import RequestResult


def make_result(
    success=False,
    status_code=None,
    error=None,
    error_type=None,
    response_time=0.1,
) -> RequestResult:
    """Helper to create a RequestResult for tests."""
    return RequestResult(
        success=success,
        status_code=status_code,
        response_time=response_time,
        error=error,
        error_type=error_type,
    )


class TestDiagnoseStatusCodes:
    @pytest.mark.parametrize(
        "code,expected_category",
        [
            (401, "auth"),
            (403, "auth"),
            (429, "rate_limit"),
            (400, "client"),
            (404, "client"),
            (405, "client"),
            (422, "client"),
            (500, "server"),
            (502, "server"),
            (503, "server"),
            (504, "server"),
        ],
    )
    def test_known_status_code(self, code, expected_category):
        result = make_result(status_code=code)
        diag = DiagnosisEngine.diagnose(result)
        assert isinstance(diag, Diagnosis)
        assert diag.category == expected_category
        assert str(code) in diag.issue

    def test_unknown_4xx(self):
        result = make_result(status_code=418)
        diag = DiagnosisEngine.diagnose(result)
        assert diag.category == "client"
        assert "418" in diag.issue

    def test_unknown_5xx(self):
        result = make_result(status_code=599)
        diag = DiagnosisEngine.diagnose(result)
        assert diag.category == "server"
        assert "599" in diag.issue


class TestDiagnoseErrors:
    def test_timeout_error(self):
        result = make_result(error_type="TIMEOUT", error="Request timeout")
        diag = DiagnosisEngine.diagnose(result)
        assert diag.category == "network"
        assert "Timeout" in diag.issue

    def test_connection_error(self):
        result = make_result(error_type="CONNECTION_ERROR", error="Connection failed")
        diag = DiagnosisEngine.diagnose(result)
        assert diag.category == "network"
        assert "Connection" in diag.issue

    def test_generic_error(self):
        result = make_result(error="Something broke")
        diag = DiagnosisEngine.diagnose(result)
        assert diag.category == "unknown"
        assert diag.cause == "Something broke"


class TestDiagnoseSuccess:
    def test_successful_request(self):
        result = make_result(success=True, status_code=200)
        diag = DiagnosisEngine.diagnose(result)
        assert diag.category == "success"
        assert diag.severity == "low"
        assert "Successful" in diag.issue


class TestDiagnosisSeverities:
    def test_critical_severity(self):
        result = make_result(status_code=401)
        diag = DiagnosisEngine.diagnose(result)
        assert diag.severity == "critical"

    def test_high_severity(self):
        result = make_result(status_code=400)
        diag = DiagnosisEngine.diagnose(result)
        assert diag.severity == "high"

    def test_medium_severity(self):
        result = make_result(status_code=429)
        diag = DiagnosisEngine.diagnose(result)
        assert diag.severity == "medium"


class TestGetSummary:
    def test_summary_all_success(self):
        results = [
            make_result(success=True, status_code=200, response_time=0.1),
            make_result(success=True, status_code=200, response_time=0.2),
        ]
        summary = DiagnosisEngine.get_summary(results)
        assert summary["total_requests"] == 2
        assert summary["successful"] == 2
        assert summary["failed"] == 0
        assert summary["success_rate"] == 100.0
        assert summary["avg_response_time"] == pytest.approx(0.15, abs=0.01)
        assert summary["diagnoses"] == []

    def test_summary_mixed(self):
        results = [
            make_result(success=True, status_code=200, response_time=0.1),
            make_result(success=False, status_code=500, response_time=0.5),
        ]
        summary = DiagnosisEngine.get_summary(results)
        assert summary["total_requests"] == 2
        assert summary["successful"] == 1
        assert summary["failed"] == 1
        assert summary["success_rate"] == 50.0
        assert len(summary["diagnoses"]) == 1

    def test_summary_empty(self):
        summary = DiagnosisEngine.get_summary([])
        assert summary["total_requests"] == 0
        assert summary["success_rate"] == 0

    def test_summary_error_counts(self):
        results = [
            make_result(success=False, status_code=401),
            make_result(success=False, status_code=500),
            make_result(success=False, status_code=502),
        ]
        summary = DiagnosisEngine.get_summary(results)
        assert "auth" in summary["error_counts"]
        assert "server" in summary["error_counts"]
        assert summary["error_counts"]["server"] == 2


class TestDiagnoseBatch:
    def test_batch_groups_by_severity(self):
        results = [
            make_result(success=False, status_code=401),  # critical
            make_result(success=False, status_code=400),  # high
            make_result(success=False, status_code=429),  # medium
        ]
        grouped = DiagnosisEngine.diagnose_batch(results)
        assert len(grouped["critical"]) == 1
        assert len(grouped["high"]) == 1
        assert len(grouped["medium"]) == 1
        assert len(grouped["low"]) == 0
