"""
Monitor execution engine.

Executes all requests in a monitor's collection, evaluates assertions,
records a MonitorRun, and fires alerts when consecutive failures breach
the threshold.
"""

import logging
import time
from datetime import UTC

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .database import _get_session_factory
from .models import (
    Collection,
    Monitor,
    MonitorNotification,
    MonitorRun,
    MonitorStatus,
    SavedRequest,
    _utcnow,
)

logger = logging.getLogger(__name__)


# ── Assertion evaluator ──────────────────────────────────────────────────────


def evaluate_assertion(assertion: dict, response: dict) -> dict:
    """Evaluate a single assertion against a response.

    Returns dict with {"passed": bool, "assertion": ..., "actual": ..., "message": ...}
    """
    a_type = assertion.get("type", "")
    operator = assertion.get("operator", "eq")
    expected = assertion.get("value", "")
    result = {"assertion": assertion, "passed": False, "actual": None, "message": ""}

    try:
        if a_type == "status_code":
            actual = response.get("status_code")
            result["actual"] = actual
            expected_int = int(expected)
            if operator == "eq":
                result["passed"] = actual == expected_int
            elif operator == "lt":
                result["passed"] = actual is not None and actual < expected_int
            elif operator == "gt":
                result["passed"] = actual is not None and actual > expected_int
            result["message"] = f"Status code: {actual} {operator} {expected_int}"

        elif a_type == "response_time":
            actual = response.get("response_time", 0)
            result["actual"] = actual
            expected_float = float(expected)
            if operator == "lt":
                result["passed"] = actual < expected_float
            elif operator == "gt":
                result["passed"] = actual > expected_float
            elif operator == "eq":
                result["passed"] = abs(actual - expected_float) < 0.01
            result["message"] = f"Response time: {actual:.3f}s {operator} {expected_float}s"

        elif a_type == "body_contains":
            body = response.get("body", "") or ""
            result["actual"] = f"...{len(body)} chars..."
            result["passed"] = expected in body
            result["message"] = (
                f"Body {'contains' if result['passed'] else 'does not contain'} '{expected}'"
            )

        elif a_type == "header_exists":
            headers = response.get("headers", {})
            result["actual"] = list(headers.keys()) if headers else []
            result["passed"] = expected.lower() in {k.lower() for k in headers}
            result["message"] = (
                f"Header '{expected}' {'exists' if result['passed'] else 'not found'}"
            )

        else:
            result["message"] = f"Unknown assertion type: {a_type}"

    except Exception as e:
        result["message"] = f"Assertion error: {str(e)}"

    return result


# ── Request executor ─────────────────────────────────────────────────────────


async def _execute_request(req: SavedRequest) -> dict:
    """Execute a single saved request and return results dict."""
    result = {
        "request_name": req.name,
        "method": req.method,
        "url": req.url,
        "status_code": None,
        "response_time": 0,
        "body": None,
        "headers": {},
        "success": False,
        "error": None,
    }

    try:
        headers = req.headers or {}
        params = req.params or {}

        start = time.time()
        async with httpx.AsyncClient(
            timeout=req.timeout or 10,
            follow_redirects=True,
        ) as client:
            response = await client.request(
                method=req.method.upper(),
                url=req.url,
                headers=headers,
                params=params,
                content=req.body if req.body else None,
            )
        elapsed = time.time() - start

        result["status_code"] = response.status_code
        result["response_time"] = elapsed
        result["headers"] = dict(response.headers)
        result["success"] = response.is_success
        try:
            result["body"] = response.text[:10000]  # Cap body size
        except Exception:
            result["body"] = "<binary>"

        if not result["success"]:
            result["error"] = f"HTTP {response.status_code}"

    except httpx.TimeoutException:
        result["error"] = "Request timeout"
    except httpx.ConnectError:
        result["error"] = "Connection error"
    except Exception as e:
        result["error"] = str(e)

    return result


# ── Main executor ────────────────────────────────────────────────────────────


async def execute_monitor(monitor_id: str) -> MonitorRun | None:
    """Execute a monitor: run all collection requests, evaluate assertions,
    record results, fire alerts if needed. Designed for background execution."""
    session_factory = _get_session_factory()
    async with session_factory() as db:
        try:
            return await _run_monitor(db, monitor_id)
        except Exception as e:
            logger.exception(f"Monitor {monitor_id} execution failed: {e}")
            return None


async def _run_monitor(db: AsyncSession, monitor_id: str) -> MonitorRun | None:
    """Core monitor execution logic."""
    # Load monitor with collection + requests
    result = await db.execute(
        select(Monitor)
        .where(Monitor.id == monitor_id)
        .options(
            selectinload(Monitor.collection).selectinload(Collection.requests),
            selectinload(Monitor.notification_links).selectinload(MonitorNotification.channel),
        )
    )
    monitor = result.scalar_one_or_none()
    if not monitor:
        logger.warning(f"Monitor {monitor_id} not found")
        return None

    collection = monitor.collection
    if not collection:
        logger.warning(f"Collection for monitor {monitor_id} not found")
        return None

    requests_list = sorted(collection.requests, key=lambda r: r.sort_order)

    # Start run
    start_time = time.time()
    run = MonitorRun(
        monitor_id=monitor_id,
        status=MonitorStatus.PASSING,
        total_requests=len(requests_list),
    )

    request_results = []
    all_assertion_results = []
    passed_requests = 0
    failed_requests = 0

    # Execute each request
    for req in requests_list:
        req_result = await _execute_request(req)
        request_results.append(req_result)

        if req_result["success"]:
            passed_requests += 1
        else:
            failed_requests += 1

        # Evaluate assertions for each response
        for assertion in monitor.assertions or []:
            a_result = evaluate_assertion(assertion, req_result)
            all_assertion_results.append(
                {
                    "request_name": req.name,
                    **a_result,
                }
            )

    # Compute results
    elapsed_ms = int((time.time() - start_time) * 1000)
    assertions_passed = sum(1 for a in all_assertion_results if a["passed"])
    assertions_failed = sum(1 for a in all_assertion_results if not a["passed"])

    any_request_failed = failed_requests > 0
    any_assertion_failed = assertions_failed > 0

    if any_request_failed or any_assertion_failed:
        run.status = MonitorStatus.FAILING
    else:
        run.status = MonitorStatus.PASSING

    run.duration_ms = elapsed_ms
    run.passed_requests = passed_requests
    run.failed_requests = failed_requests
    run.assertions_passed = assertions_passed
    run.assertions_failed = assertions_failed
    run.results = request_results
    run.completed_at = _utcnow()

    db.add(run)

    # Update monitor status
    now = _utcnow()
    monitor.last_run_at = now
    monitor.last_status = run.status

    if run.status == MonitorStatus.FAILING:
        monitor.consecutive_failures += 1
    else:
        monitor.consecutive_failures = 0

    # Compute next_run_at
    try:
        from datetime import datetime

        from croniter import croniter

        cron = croniter(monitor.cron_expression, now)
        monitor.next_run_at = datetime.fromtimestamp(cron.get_next(ret_type=float), tz=UTC)
    except Exception:
        pass

    await db.commit()
    await db.refresh(run)

    # Fire alerts if consecutive failures >= threshold
    if (
        run.status == MonitorStatus.FAILING
        and monitor.consecutive_failures >= monitor.alert_after_failures
    ):
        await _fire_alerts(db, monitor, run)

    return run


async def _fire_alerts(db: AsyncSession, monitor: Monitor, run: MonitorRun) -> None:
    """Send alert notifications for a failing monitor."""
    from .notifier import send_notification

    subject = f"🚨 Monitor Alert: {monitor.name} is FAILING"
    message = (
        f"Monitor '{monitor.name}' has failed {monitor.consecutive_failures} "
        f"consecutive time(s).\n\n"
        f"Status: {run.status.value}\n"
        f"Duration: {run.duration_ms}ms\n"
        f"Requests: {run.passed_requests}/{run.total_requests} passed\n"
        f"Assertions: {run.assertions_passed} passed, {run.assertions_failed} failed\n"
    )

    if run.error:
        message += f"\nError: {run.error}\n"

    for link in monitor.notification_links:
        channel = link.channel
        if channel and channel.enabled:
            try:
                await send_notification(channel, subject=subject, message=message)
            except Exception as e:
                logger.error(f"Failed to send alert via {channel.name}: {e}")
