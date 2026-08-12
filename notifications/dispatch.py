"""Bridges in-app Notification creation to real SMS/Email dispatch. Every alert in this
system used to stop at an in-app row — despite send_sms (backend/sms.py) and Django's email
backend both being fully wired up elsewhere (password-reset OTP, the messaging app), nothing
called them when rent went overdue or a lease was expiring. This module is the one place that
actually reaches the recipient's phone/inbox, reusing those senders rather than duplicating
transport logic here — and logs every send into messaging.EmailMessage/SMSMessage so it shows
up in the same Message Log the manually-sent messages do.

Best-effort: a failed SMS/email send never blocks the notification itself from being created —
these are convenience channels layered on top of the always-reliable in-app notification.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail

from .models import Notification

logger = logging.getLogger(__name__)


def notify(user, notification_type, title, message, link='', priority='normal',
           related_object_id=None, channels=('app', 'email', 'sms')):
    """Create an in-app Notification and best-effort fan it out to email/SMS too."""
    notif = Notification.objects.create(
        user=user, notification_type=notification_type, priority=priority,
        title=title, message=message, link=link, related_object_id=related_object_id,
    )

    if 'email' in channels and user.email:
        _send_email(user, title, message)
    if 'sms' in channels and user.phone:
        _send_sms(user, title, message)

    return notif


def _send_email(user, title, message):
    from messaging.models import EmailMessage
    try:
        send_mail(
            subject=title, message=message,
            from_email=settings.DEFAULT_FROM_EMAIL, recipient_list=[user.email], fail_silently=False,
        )
        EmailMessage.objects.create(
            to_email=user.email, to_name=user.get_full_name() or user.username,
            subject=title, body=message, status='sent')
    except Exception as exc:
        logger.warning('Notification email to %s failed: %s', user.email, exc)
        EmailMessage.objects.create(
            to_email=user.email, to_name=user.get_full_name() or user.username,
            subject=title, body=message, status='failed', error_message=str(exc)[:500])


def _send_sms(user, title, message):
    from messaging.models import SMSMessage
    from backend.sms import send_sms
    body = f"{title}: {message}"[:300]
    try:
        sid = send_sms(user.phone, body)
        SMSMessage.objects.create(
            to_phone=user.phone, to_name=user.get_full_name() or user.username, body=body,
            status='simulated' if sid == 'SIMULATED' else 'sent',
            twilio_sid='' if sid == 'SIMULATED' else sid)
    except Exception as exc:
        logger.warning('Notification SMS to %s failed: %s', user.phone, exc)
        SMSMessage.objects.create(
            to_phone=user.phone, to_name=user.get_full_name() or user.username, body=body,
            status='failed', error_message=str(exc)[:500])
