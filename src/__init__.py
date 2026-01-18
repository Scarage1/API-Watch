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
from .runner import APIRunner, RequestConfig, RequestResult
from .auth import AuthHandler
from .retry import RetryHandler, RetryConfig
from .diagnose import DiagnosisEngine, Diagnosis
from .report import ReportGenerator

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
