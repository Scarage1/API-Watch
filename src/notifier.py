"""
Notification sender — delivers alerts via email, webhook, or Slack.
"""

import logging

import httpx

from .models import ChannelType, NotificationChannel

logger = logging.getLogger(__name__)


async def send_notification(
    channel: NotificationChannel,
    subject: str,
    message: str,
) -> bool:
    """Send a notification through the given channel. Returns True on success."""
    try:
        if channel.channel_type == ChannelType.WEBHOOK:
            return await _send_webhook(channel, subject, message)
        elif channel.channel_type == ChannelType.SLACK:
            return await _send_slack(channel, subject, message)
        elif channel.channel_type == ChannelType.EMAIL:
            return await _send_email(channel, subject, message)
        else:
            logger.warning(f"Unknown channel type: {channel.channel_type}")
            return False
    except Exception as e:
        logger.error(f"Notification send error ({channel.name}): {e}")
        return False


async def _send_webhook(
    channel: NotificationChannel,
    subject: str,
    message: str,
) -> bool:
    """Send notification via HTTP webhook."""
    config = channel.config
    url = config.get("url", "")
    method = config.get("method", "POST").upper()
    headers = config.get("headers", {})
    headers.setdefault("Content-Type", "application/json")

    payload = {
        "subject": subject,
        "message": message,
        "channel_name": channel.name,
        "timestamp": str(__import__("datetime").datetime.now(__import__("datetime").timezone.utc)),
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.request(method=method, url=url, headers=headers, json=payload)
        if response.is_success:
            logger.info(f"Webhook notification sent to {url}")
            return True
        logger.warning(f"Webhook returned {response.status_code}: {response.text[:200]}")
        return False


async def _send_slack(
    channel: NotificationChannel,
    subject: str,
    message: str,
) -> bool:
    """Send notification via Slack incoming webhook."""
    config = channel.config
    webhook_url = config.get("webhook_url", "")

    payload = {
        "text": f"*{subject}*\n{message}",
        "username": "API-Watch",
        "icon_emoji": ":satellite:",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(webhook_url, json=payload)
        if response.is_success:
            logger.info("Slack notification sent")
            return True
        logger.warning(f"Slack webhook returned {response.status_code}")
        return False


async def _send_email(
    channel: NotificationChannel,
    subject: str,
    message: str,
) -> bool:
    """Send email notification.

    Currently logs the email (actual SMTP/Azure Communication Services
    integration is configured via environment variables in production).
    """
    config = channel.config
    recipients = config.get("recipients", [])

    # In production this would use Azure Communication Services or SMTP
    # For now, log it and return success
    smtp_host = __import__("os").environ.get("SMTP_HOST")
    if smtp_host:
        try:
            import smtplib
            from email.mime.text import MIMEText

            smtp_port = int(__import__("os").environ.get("SMTP_PORT", "587"))
            smtp_user = __import__("os").environ.get("SMTP_USER", "")
            smtp_pass = __import__("os").environ.get("SMTP_PASS", "")
            from_addr = __import__("os").environ.get("SMTP_FROM", smtp_user)

            msg = MIMEText(message)
            msg["Subject"] = subject
            msg["From"] = from_addr
            msg["To"] = ", ".join(recipients)

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                if smtp_user:
                    server.login(smtp_user, smtp_pass)
                server.sendmail(from_addr, recipients, msg.as_string())

            logger.info(f"Email sent to {recipients}")
            return True
        except Exception as e:
            logger.error(f"SMTP error: {e}")
            return False

    # Fallback: log-only mode
    logger.info(f"[EMAIL] To: {recipients} | Subject: {subject}\n{message}")
    return True
