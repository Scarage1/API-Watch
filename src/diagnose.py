"""
Diagnosis engine for API failures.
Analyzes errors and provides troubleshooting suggestions.
"""
from typing import Optional, Dict, List
from dataclasses import dataclass
from .runner import RequestResult


@dataclass
class Diagnosis:
    """Diagnosis result for an API failure."""
    issue: str
    cause: str
    suggestion: str
    severity: str  # "critical", "high", "medium", "low"
    category: str  # "auth", "rate_limit", "server", "client", "network"


class DiagnosisEngine:
    """Analyzes API failures and provides troubleshooting guidance."""
    
    # Diagnosis rules mapping
    DIAGNOSIS_RULES = {
        # Authentication errors
        401: Diagnosis(
            issue="Unauthorized Access (401)",
            cause="Authentication token is missing, invalid, or expired",
            suggestion="Verify your API token/key is correct and not expired. Check if token is properly included in Authorization header.",
            severity="critical",
            category="auth"
        ),
        403: Diagnosis(
            issue="Forbidden Access (403)",
            cause="Insufficient permissions or API key lacks required scopes",
            suggestion="Verify your API key has the necessary permissions/scopes for this endpoint. Contact API provider to check access rights.",
            severity="high",
            category="auth"
        ),
        
        # Rate limiting
        429: Diagnosis(
            issue="Rate Limit Exceeded (429)",
            cause="Too many requests sent in a given timeframe",
            suggestion="Wait before retrying. Implement exponential backoff. Check rate limit headers for reset time. Consider upgrading API plan if needed.",
            severity="medium",
            category="rate_limit"
        ),
        
        # Client errors
        400: Diagnosis(
            issue="Bad Request (400)",
            cause="Request syntax is malformed or invalid parameters",
            suggestion="Check request body format, required fields, and parameter types. Review API documentation for correct request structure.",
            severity="high",
            category="client"
        ),
        404: Diagnosis(
            issue="Not Found (404)",
            cause="The requested resource or endpoint does not exist",
            suggestion="Verify the endpoint URL is correct. Check if the resource ID is valid. Ensure you're using the correct API version.",
            severity="medium",
            category="client"
        ),
        405: Diagnosis(
            issue="Method Not Allowed (405)",
            cause="HTTP method not supported for this endpoint",
            suggestion="Check API documentation for supported HTTP methods (GET/POST/PUT/DELETE) for this endpoint.",
            severity="medium",
            category="client"
        ),
        422: Diagnosis(
            issue="Unprocessable Entity (422)",
            cause="Request is well-formed but contains semantic errors",
            suggestion="Validate all field values against API requirements. Check data types, formats, and business logic constraints.",
            severity="high",
            category="client"
        ),
        
        # Server errors
        500: Diagnosis(
            issue="Internal Server Error (500)",
            cause="Server encountered an unexpected condition",
            suggestion="This is a server-side issue. Retry the request after a short delay. If problem persists, contact API provider support.",
            severity="critical",
            category="server"
        ),
        502: Diagnosis(
            issue="Bad Gateway (502)",
            cause="Server received invalid response from upstream server",
            suggestion="Temporary server infrastructure issue. Retry after a short delay. Contact API provider if persists.",
            severity="high",
            category="server"
        ),
        503: Diagnosis(
            issue="Service Unavailable (503)",
            cause="Server is temporarily unable to handle the request",
            suggestion="Service may be under maintenance or overloaded. Wait and retry. Check API provider status page.",
            severity="high",
            category="server"
        ),
        504: Diagnosis(
            issue="Gateway Timeout (504)",
            cause="Server did not receive timely response from upstream",
            suggestion="Increase request timeout. Check if endpoint typically has slow response. Retry after delay.",
            severity="high",
            category="server"
        ),
    }
    
    @staticmethod
    def diagnose(result: RequestResult) -> Diagnosis:
        """
        Diagnose API failure and provide troubleshooting guidance.
        
        Args:
            result: RequestResult to diagnose
            
        Returns:
            Diagnosis with issue, cause, and suggestions
        """
        # Handle success case
        if result.success:
            return Diagnosis(
                issue="Request Successful",
                cause="N/A",
                suggestion="No action needed",
                severity="low",
                category="success"
            )
        
        # Check for network/timeout errors
        if result.error_type == "TIMEOUT":
            return Diagnosis(
                issue="Request Timeout",
                cause="Request took longer than configured timeout period",
                suggestion="Increase timeout value. Check network connectivity. Verify endpoint performance. Consider if endpoint is experiencing high load.",
                severity="high",
                category="network"
            )
        
        if result.error_type == "CONNECTION_ERROR":
            return Diagnosis(
                issue="Connection Failed",
                cause="Unable to establish connection to server",
                suggestion="Check network connectivity. Verify the URL is correct. Check if firewall/proxy is blocking the request. Ensure DNS resolution is working.",
                severity="critical",
                category="network"
            )
        
        # Check for HTTP status code based diagnosis
        if result.status_code:
            if result.status_code in DiagnosisEngine.DIAGNOSIS_RULES:
                return DiagnosisEngine.DIAGNOSIS_RULES[result.status_code]
            
            # Handle status code ranges not in rules
            if 400 <= result.status_code < 500:
                return Diagnosis(
                    issue=f"Client Error ({result.status_code})",
                    cause="Request contains invalid data or parameters",
                    suggestion="Review API documentation. Check request format, parameters, and authentication.",
                    severity="high",
                    category="client"
                )
            
            if 500 <= result.status_code < 600:
                return Diagnosis(
                    issue=f"Server Error ({result.status_code})",
                    cause="Server-side error occurred",
                    suggestion="Retry request after delay. Contact API provider if issue persists.",
                    severity="high",
                    category="server"
                )
        
        # Generic error
        return Diagnosis(
            issue="Unknown Error",
            cause=result.error or "Unknown error occurred",
            suggestion="Check request configuration. Review logs for details. Ensure all required parameters are provided.",
            severity="medium",
            category="unknown"
        )
    
    @staticmethod
    def diagnose_batch(results: List[RequestResult]) -> Dict[str, List[Diagnosis]]:
        """
        Diagnose multiple results and group by category.
        
        Args:
            results: List of RequestResult objects
            
        Returns:
            Dictionary mapping categories to list of diagnoses
        """
        diagnoses_by_category: Dict[str, List[Diagnosis]] = {
            "critical": [],
            "high": [],
            "medium": [],
            "low": []
        }
        
        for result in results:
            diagnosis = DiagnosisEngine.diagnose(result)
            diagnoses_by_category[diagnosis.severity].append(diagnosis)
        
        return diagnoses_by_category
    
    @staticmethod
    def get_summary(results: List[RequestResult]) -> Dict[str, any]:
        """
        Get summary statistics and diagnosis for a batch of results.
        
        Args:
            results: List of RequestResult objects
            
        Returns:
            Summary dictionary with statistics and diagnoses
        """
        total = len(results)
        successful = sum(1 for r in results if r.success)
        failed = total - successful
        
        # Count by error type
        error_counts: Dict[str, int] = {}
        for result in results:
            if not result.success:
                diagnosis = DiagnosisEngine.diagnose(result)
                category = diagnosis.category
                error_counts[category] = error_counts.get(category, 0) + 1
        
        # Calculate average response time
        avg_response_time = sum(r.response_time for r in results) / total if total > 0 else 0
        
        # Get all diagnoses
        diagnoses = [DiagnosisEngine.diagnose(r) for r in results if not r.success]
        
        return {
            "total_requests": total,
            "successful": successful,
            "failed": failed,
            "success_rate": (successful / total * 100) if total > 0 else 0,
            "avg_response_time": avg_response_time,
            "error_counts": error_counts,
            "diagnoses": diagnoses
        }
