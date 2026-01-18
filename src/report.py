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


# HTML Report Template
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Test Report - {{ timestamp }}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f7fa;
            color: #2c3e50;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
        }
        
        .header h1 {
            font-size: 32px;
            margin-bottom: 10px;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 16px;
        }
        
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }
        
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        }
        
        .stat-card h3 {
            font-size: 14px;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        
        .stat-card .value {
            font-size: 32px;
            font-weight: bold;
            color: #2c3e50;
        }
        
        .stat-card.success .value { color: #28a745; }
        .stat-card.danger .value { color: #dc3545; }
        .stat-card.warning .value { color: #ffc107; }
        .stat-card.info .value { color: #17a2b8; }
        
        .content {
            padding: 30px;
        }
        
        .section {
            margin-bottom: 40px;
        }
        
        .section-title {
            font-size: 24px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        
        .test-result {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            margin-bottom: 15px;
            overflow: hidden;
        }
        
        .test-header {
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .test-header:hover {
            background: #f8f9fa;
        }
        
        .test-header.success {
            border-left: 4px solid #28a745;
        }
        
        .test-header.failure {
            border-left: 4px solid #dc3545;
        }
        
        .test-info {
            flex: 1;
        }
        
        .test-method {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            margin-right: 10px;
        }
        
        .method-GET { background: #28a745; color: white; }
        .method-POST { background: #007bff; color: white; }
        .method-PUT { background: #ffc107; color: #000; }
        .method-DELETE { background: #dc3545; color: white; }
        
        .test-url {
            font-family: 'Courier New', monospace;
            font-size: 14px;
            color: #495057;
        }
        
        .test-meta {
            display: flex;
            gap: 15px;
            font-size: 13px;
            color: #6c757d;
        }
        
        .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        }
        
        .status-success {
            background: #d4edda;
            color: #155724;
        }
        
        .status-failure {
            background: #f8d7da;
            color: #721c24;
        }
        
        .test-details {
            padding: 20px;
            background: #f8f9fa;
            border-top: 1px solid #dee2e6;
            display: none;
        }
        
        .test-result.expanded .test-details {
            display: block;
        }
        
        .detail-group {
            margin-bottom: 20px;
        }
        
        .detail-group h4 {
            font-size: 14px;
            color: #6c757d;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .detail-content {
            background: white;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #dee2e6;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            overflow-x: auto;
        }
        
        .diagnosis {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 15px;
        }
        
        .diagnosis.critical {
            background: #f8d7da;
            border-left-color: #dc3545;
        }
        
        .diagnosis.high {
            background: #fff3cd;
            border-left-color: #ffc107;
        }
        
        .diagnosis h4 {
            color: #856404;
            margin-bottom: 8px;
        }
        
        .diagnosis.critical h4 {
            color: #721c24;
        }
        
        .diagnosis p {
            margin: 5px 0;
            font-size: 14px;
        }
        
        .footer {
            background: #f8f9fa;
            padding: 20px 30px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
        }
        
        @media (max-width: 768px) {
            .summary {
                grid-template-columns: 1fr;
            }
            
            .test-header {
                flex-direction: column;
                align-items: flex-start;
            }
            
            .test-meta {
                margin-top: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 API Test Report</h1>
            <p>Generated: {{ timestamp }}</p>
            {% if test_suite_name %}
            <p>Test Suite: {{ test_suite_name }}</p>
            {% endif %}
        </div>
        
        <div class="summary">
            <div class="stat-card">
                <h3>Total Requests</h3>
                <div class="value">{{ summary.total_requests }}</div>
            </div>
            <div class="stat-card success">
                <h3>Successful</h3>
                <div class="value">{{ summary.successful }}</div>
            </div>
            <div class="stat-card danger">
                <h3>Failed</h3>
                <div class="value">{{ summary.failed }}</div>
            </div>
            <div class="stat-card info">
                <h3>Success Rate</h3>
                <div class="value">{{ "%.1f"|format(summary.success_rate) }}%</div>
            </div>
            <div class="stat-card info">
                <h3>Avg Response Time</h3>
                <div class="value">{{ avg_response_time }}</div>
            </div>
        </div>
        
        <div class="content">
            {% if summary.failed > 0 %}
            <div class="section">
                <h2 class="section-title">⚠️ Issues Found</h2>
                {% for diagnosis in failed_diagnoses %}
                <div class="diagnosis {{ diagnosis.severity }}">
                    <h4>{{ diagnosis.issue }}</h4>
                    <p><strong>Cause:</strong> {{ diagnosis.cause }}</p>
                    <p><strong>Suggestion:</strong> {{ diagnosis.suggestion }}</p>
                </div>
                {% endfor %}
            </div>
            {% endif %}
            
            <div class="section">
                <h2 class="section-title">📋 Test Results</h2>
                {% for result in results %}
                <div class="test-result {% if result.success %}expanded{% endif %}">
                    <div class="test-header {% if result.success %}success{% else %}failure{% endif %}" 
                         onclick="this.parentElement.classList.toggle('expanded')">
                        <div class="test-info">
                            <div>
                                <span class="test-method method-{{ result.request_method }}">{{ result.request_method }}</span>
                                <span class="test-url">{{ result.request_url }}</span>
                            </div>
                            <div class="test-meta">
                                <span>Status: {{ result.status_code or 'N/A' }}</span>
                                <span>Time: {{ format_duration(result.response_time) }}</span>
                                <span>Size: {{ format_bytes(result.response_size) }}</span>
                                {% if result.retry_count > 0 %}
                                <span>Retries: {{ result.retry_count }}</span>
                                {% endif %}
                            </div>
                        </div>
                        <span class="status-badge {% if result.success %}status-success{% else %}status-failure{% endif %}">
                            {% if result.success %}✓ Success{% else %}✗ Failed{% endif %}
                        </span>
                    </div>
                    
                    <div class="test-details">
                        {% if not result.success %}
                        <div class="detail-group">
                            <h4>🔍 Diagnosis</h4>
                            {% set diag = diagnose(result) %}
                            <div class="diagnosis {{ diag.severity }}">
                                <h4>{{ diag.issue }}</h4>
                                <p><strong>Cause:</strong> {{ diag.cause }}</p>
                                <p><strong>Suggestion:</strong> {{ diag.suggestion }}</p>
                                <p><strong>Category:</strong> {{ diag.category }}</p>
                            </div>
                        </div>
                        {% endif %}
                        
                        <div class="detail-group">
                            <h4>Response Body</h4>
                            <div class="detail-content">{{ result.response_body or 'No response body' }}</div>
                        </div>
                        
                        <div class="detail-group">
                            <h4>Response Headers</h4>
                            <div class="detail-content">{{ result.response_headers | tojson(indent=2) }}</div>
                        </div>
                    </div>
                </div>
                {% endfor %}
            </div>
        </div>
        
        <div class="footer">
            <p>Generated by API Debugging & Monitoring Toolkit</p>
            <p>Built for Forward Deployed Engineers</p>
        </div>
    </div>
    
    <script>
        // Auto-expand failed tests on load
        document.addEventListener('DOMContentLoaded', function() {
            const failedTests = document.querySelectorAll('.test-header.failure');
            failedTests.forEach(test => {
                test.parentElement.classList.add('expanded');
            });
        });
    </script>
</body>
</html>
"""


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
        template = Template(HTML_TEMPLATE)
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
