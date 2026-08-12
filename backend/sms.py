"""Twilio SMS sending — a shared helper, not tied to any one feature. Currently used by the
forgot-password OTP flow (users/views.py); the natural place to hook in rent-overdue/lease-
expiry SMS alerts later too, the same way whatsapp_integration wraps its own provider.

Falls back to a logged "simulated" send when TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN aren't
configured, so local dev and tests can exercise the surrounding flow without real credentials.
"""
import logging
import re

from django.conf import settings
from twilio.rest import Client

logger = logging.getLogger(__name__)

ZW_COUNTRY_CODE = '263'


def to_e164(phone, default_country_code=ZW_COUNTRY_CODE):
    """Best-effort normalize a Zimbabwean-style local number to E.164 for Twilio.
    Returns None if there aren't enough digits to plausibly be a phone number."""
    if not phone:
        return None
    raw = phone.strip()
    digits = re.sub(r'\D', '', raw)
    if len(digits) < 7:
        return None
    if raw.startswith('+'):
        return '+' + digits
    if digits.startswith('00'):
        return '+' + digits[2:]
    if digits.startswith(default_country_code):
        return '+' + digits
    if digits.startswith('0'):
        return '+' + default_country_code + digits[1:]
    return '+' + default_country_code + digits


def send_sms(to, body):
    """Send an SMS via the Twilio Messaging Service. Returns the Twilio Message SID, or
    'SIMULATED' when Twilio credentials aren't configured (dev/CI)."""
    e164 = to_e164(to)
    if not e164:
        raise ValueError(f"'{to}' is not a usable phone number for SMS.")

    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning('Twilio not configured — simulating SMS to %s: %s', e164, body)
        return 'SIMULATED'

    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    message = client.messages.create(
        body=body,
        messaging_service_sid=settings.TWILIO_MESSAGING_SERVICE_SID,
        to=e164,
    )
    return message.sid
