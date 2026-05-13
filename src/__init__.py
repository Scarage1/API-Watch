"""
APIWatch - API Debugging & Monitoring Toolkit
Watch, debug, and monitor your REST APIs with intelligence.

A production-ready CLI toolkit for testing API integrations, automatically
detecting failures, and generating comprehensive reports.
"""

__version__ = "1.0.0"
__author__ = "Kumar"
__description__ = "APIWatch - Intelligent API debugging and monitoring toolkit"

# Export main classes for easier imports
from .auth import AuthHandler
from .diagnose import Diagnosis, DiagnosisEngine
from .report import ReportGenerator
from .retry import RetryConfig, RetryHandler
from .runner import APIRunner, RequestConfig, RequestResult

__all__ = [
    "APIRunner",
    "RequestConfig",
    "RequestResult",
    "AuthHandler",
    "RetryHandler",
    "RetryConfig",
    "DiagnosisEngine",
    "Diagnosis",
    "ReportGenerator",
]
