"""
JUnit XML writer — converts monitor run results into JUnit XML format
for integration with CI/CD pipelines (GitHub Actions, Azure DevOps, etc.).
"""
from typing import Optional
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString


def monitor_run_to_junit(monitor_name: str, run) -> str:
    """Convert a MonitorRun model instance into JUnit XML string.

    Args:
        monitor_name: Name of the monitor
        run: MonitorRun model instance with .results, .status, etc.

    Returns:
        Pretty-printed JUnit XML string
    """
    # Root testsuite element
    testsuite = Element("testsuite")
    testsuite.set("name", monitor_name)
    testsuite.set("tests", str(run.total_requests))
    testsuite.set("failures", str(run.failed_requests))
    testsuite.set("errors", "0")
    testsuite.set("time", str((run.duration_ms or 0) / 1000.0))
    testsuite.set("timestamp", run.started_at.isoformat() if run.started_at else "")

    # Create a testcase for each request result
    results = run.results or []
    for i, result in enumerate(results):
        testcase = SubElement(testsuite, "testcase")
        testcase.set("classname", monitor_name)
        testcase.set("name", result.get("request_name", f"Request {i + 1}"))
        testcase.set("time", str(result.get("response_time", 0)))

        if not result.get("success"):
            error = result.get("error", "Request failed")
            status_code = result.get("status_code")

            if error and "timeout" in error.lower():
                err_elem = SubElement(testcase, "error")
                err_elem.set("type", "Timeout")
                err_elem.set("message", error)
            elif error and "connection" in error.lower():
                err_elem = SubElement(testcase, "error")
                err_elem.set("type", "ConnectionError")
                err_elem.set("message", error)
            else:
                failure = SubElement(testcase, "failure")
                failure.set("type", "AssertionFailure")
                msg = f"HTTP {status_code}" if status_code else (error or "Failed")
                failure.set("message", msg)
                failure.text = (
                    f"Method: {result.get('method', 'GET')}\n"
                    f"URL: {result.get('url', '')}\n"
                    f"Status: {status_code}\n"
                    f"Error: {error}\n"
                )

    # Pretty-print
    raw_xml = tostring(testsuite, encoding="unicode", xml_declaration=False)
    xml_str = f'<?xml version="1.0" encoding="UTF-8"?>\n{raw_xml}'

    try:
        dom = parseString(xml_str)
        return dom.toprettyxml(indent="  ", encoding=None)
    except Exception:
        return xml_str


def results_to_junit(suite_name: str, results: list) -> str:
    """Convert a list of request result dicts into JUnit XML string.

    Args:
        suite_name: Name for the test suite
        results: List of dicts with keys: request_name, success, error, status_code,
                 response_time, method, url

    Returns:
        JUnit XML string
    """
    total = len(results)
    failures = sum(1 for r in results if not r.get("success"))
    total_time = sum(r.get("response_time", 0) for r in results)

    testsuite = Element("testsuite")
    testsuite.set("name", suite_name)
    testsuite.set("tests", str(total))
    testsuite.set("failures", str(failures))
    testsuite.set("errors", "0")
    testsuite.set("time", str(total_time))

    for i, result in enumerate(results):
        testcase = SubElement(testsuite, "testcase")
        testcase.set("classname", suite_name)
        testcase.set("name", result.get("request_name", f"Request {i + 1}"))
        testcase.set("time", str(result.get("response_time", 0)))

        if not result.get("success"):
            failure = SubElement(testcase, "failure")
            failure.set("type", "RequestFailure")
            failure.set("message", result.get("error", "Failed"))

    raw_xml = tostring(testsuite, encoding="unicode", xml_declaration=False)
    xml_str = f'<?xml version="1.0" encoding="UTF-8"?>\n{raw_xml}'

    try:
        dom = parseString(xml_str)
        return dom.toprettyxml(indent="  ", encoding=None)
    except Exception:
        return xml_str
