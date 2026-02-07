"""
Report generation module.
Generates HTML and JSON reports for API test results.
"""
import json
from typing import List, Dict, Any
from pathlib import Path
from jinja2 import Template

from .runner import RequestResult
from .diagnose import DiagnosisEngine, Diagnosis
from .utils import (
    ensure_directory, 
    get_timestamp, 
    format_duration, 
    format_bytes,
    get_iso_timestamp
)


# ── Template loading ──────────────────────────────────────────────────────────

_TEMPLATE_DIR = Path(__file__).parent / "templates"
_HTML_TEMPLATE_CACHE: str = ""


def _get_html_template() -> str:
    """Load the Jinja2 HTML report template from the external file.
    Cached after the first read to avoid repeated I/O."""
    global _HTML_TEMPLATE_CACHE
    if not _HTML_TEMPLATE_CACHE:
        template_path = _TEMPLATE_DIR / "report.html"
        _HTML_TEMPLATE_CACHE = template_path.read_text(encoding="utf-8")
    return _HTML_TEMPLATE_CACHE


class ReportGenerator:
    """Generates HTML and JSON reports for API test results."""
    
    def __init__(self, output_dir: str = "reports"):
        """
        Initialize report generator.
        
        Args:
            output_dir: Directory to save reports
        """
        self.output_dir = ensure_directory(output_dir)
    
    def generate(
        self,
        results: List[RequestResult],
        test_suite_name: str = None,
        format: str = "both"  # "html", "json", or "both"
    ) -> Dict[str, str]:
        """
        Generate report from test results.
        
        Args:
            results: List of RequestResult objects
            test_suite_name: Name of test suite (optional)
            format: Report format ("html", "json", or "both")
            
        Returns:
            Dictionary with paths to generated reports
        """
        timestamp = get_timestamp()
        generated_files = {}
        
        # Generate summary
        summary = DiagnosisEngine.get_summary(results)
        
        # Generate HTML report
        if format in ["html", "both"]:
            html_path = self._generate_html(results, summary, test_suite_name, timestamp)
            generated_files["html"] = str(html_path)
        
        # Generate JSON report
        if format in ["json", "both"]:
            json_path = self._generate_json(results, summary, test_suite_name, timestamp)
            generated_files["json"] = str(json_path)
        
        return generated_files
    
    def _generate_html(
        self,
        results: List[RequestResult],
        summary: Dict[str, Any],
        test_suite_name: str,
        timestamp: str
    ) -> Path:
        """Generate HTML report."""
        # Prepare failed diagnoses
        failed_diagnoses = []
        for result in results:
            if not result.success:
                diagnosis = DiagnosisEngine.diagnose(result)
                # Avoid duplicates
                if not any(d.issue == diagnosis.issue for d in failed_diagnoses):
                    failed_diagnoses.append(diagnosis)
        
        # Calculate average response time formatted
        avg_time = summary.get("avg_response_time", 0)
        avg_response_time = format_duration(avg_time)
        
        # Render template
        template = Template(_get_html_template())
        html_content = template.render(
            timestamp=get_iso_timestamp(),
            test_suite_name=test_suite_name,
            summary=summary,
            results=results,
            failed_diagnoses=failed_diagnoses,
            avg_response_time=avg_response_time,
            format_duration=format_duration,
            format_bytes=format_bytes,
            diagnose=DiagnosisEngine.diagnose
        )
        
        # Save to file
        file_path = self.output_dir / f"report_{timestamp}.html"
        file_path.write_text(html_content, encoding="utf-8")
        
        return file_path
    
    def _generate_json(
        self,
        results: List[RequestResult],
        summary: Dict[str, Any],
        test_suite_name: str,
        timestamp: str
    ) -> Path:
        """Generate JSON report."""
        # Convert results to dictionaries
        results_data = []
        for result in results:
            diagnosis = DiagnosisEngine.diagnose(result)
            
            result_dict = {
                "success": result.success,
                "status_code": result.status_code,
                "method": result.request_method,
                "url": result.request_url,
                "response_time": result.response_time,
                "response_size": result.response_size,
                "retry_count": result.retry_count,
                "timestamp": result.timestamp,
                "error": result.error,
                "error_type": result.error_type,
                "diagnosis": {
                    "issue": diagnosis.issue,
                    "cause": diagnosis.cause,
                    "suggestion": diagnosis.suggestion,
                    "severity": diagnosis.severity,
                    "category": diagnosis.category
                },
                "response_body": result.response_body,
                "response_headers": result.response_headers
            }
            results_data.append(result_dict)
        
        # Build report structure
        report = {
            "metadata": {
                "generated_at": get_iso_timestamp(),
                "test_suite_name": test_suite_name,
                "report_version": "1.0"
            },
            "summary": summary,
            "results": results_data
        }
        
        # Save to file
        file_path = self.output_dir / f"report_{timestamp}.json"
        file_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        
        return file_path
