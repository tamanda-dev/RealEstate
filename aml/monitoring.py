"""Transaction Monitoring engine: rule-based AML screening applied at each money-movement
call site (rent payments, trust deposits, property sale closings, ...). Kept separate from
views.py so it can be unit-tested and called from multiple apps without circular imports.
"""
import datetime
from decimal import Decimal

from .models import (KYCProfile, MonitoredTransaction, CTR_THRESHOLD_USD,
                      LARGE_CASH_THRESHOLD_USD, STRUCTURING_WINDOW_DAYS,
                      STRUCTURING_COUNT_THRESHOLD, HIGH_RISK_COUNTRIES)


def get_or_create_profile_for_user(user):
    profile, _ = KYCProfile.objects.get_or_create(
        user=user, defaults={'full_name': user.get_full_name() or user.username}
    )
    return profile


def get_or_create_profile_for_contact(contact):
    profile, _ = KYCProfile.objects.get_or_create(
        contact=contact, defaults={'full_name': contact.full_name}
    )
    return profile


def screen_transaction(*, subject, amount, currency, payment_method, transaction_date,
                        source_type, source_id, description=''):
    """Apply AML rules to one financial movement and, if anything triggers, create (or
    update) a MonitoredTransaction. Returns the MonitoredTransaction if flagged, else None.

    `subject` is a KYCProfile (or None — screening still runs for threshold/cash rules,
    just without PEP/jurisdiction checks).
    """
    amount = Decimal(str(amount))
    flags = []

    if amount >= CTR_THRESHOLD_USD:
        flags.append('LARGE_TRANSACTION')

    if (payment_method or '').lower() == 'cash' and amount >= LARGE_CASH_THRESHOLD_USD:
        flags.append('LARGE_CASH')

    if subject:
        if subject.is_pep:
            flags.append('PEP_INVOLVED')
        if subject.nationality and subject.nationality.strip().lower() in HIGH_RISK_COUNTRIES:
            flags.append('HIGH_RISK_JURISDICTION')
        if subject.status != 'verified':
            flags.append('KYC_NOT_VERIFIED')

        # Structuring: several transactions by the same subject in a short window whose
        # combined total clears the CTR threshold, even though none individually does.
        window_start = transaction_date - datetime.timedelta(days=STRUCTURING_WINDOW_DAYS)
        recent = MonitoredTransaction.objects.filter(
            subject=subject, transaction_date__gte=window_start, transaction_date__lte=transaction_date,
        )
        recent_count = recent.count() + 1
        recent_total = sum((t.amount for t in recent), Decimal('0')) + amount
        if recent_count >= STRUCTURING_COUNT_THRESHOLD and recent_total >= CTR_THRESHOLD_USD and amount < CTR_THRESHOLD_USD:
            flags.append('STRUCTURING')

    if not flags:
        return None

    risk_level = _risk_level_for_flags(flags)

    monitored = MonitoredTransaction.objects.create(
        subject=subject, source_type=source_type, source_id=source_id,
        amount=amount, currency=currency, payment_method=payment_method or '',
        transaction_date=transaction_date, description=description,
        flags=flags, risk_level=risk_level, status='flagged',
    )

    if subject:
        bump = {'LARGE_TRANSACTION': 10, 'LARGE_CASH': 10, 'STRUCTURING': 25,
                'PEP_INVOLVED': 0, 'HIGH_RISK_JURISDICTION': 0, 'KYC_NOT_VERIFIED': 5}
        points = sum(bump.get(f, 5) for f in flags)
        if points:
            subject.bump_risk_score(points)

    return monitored


def _risk_level_for_flags(flags):
    if 'STRUCTURING' in flags or ('PEP_INVOLVED' in flags and 'LARGE_TRANSACTION' in flags):
        return 'critical'
    if 'PEP_INVOLVED' in flags or 'HIGH_RISK_JURISDICTION' in flags:
        return 'high'
    if len(flags) >= 2:
        return 'high'
    return 'medium'


def generate_goaml_xml(monitored_transaction):
    """Render a goAML-schema-compliant XML report for one flagged transaction.

    goAML (used by Zimbabwe's RBZ Financial Intelligence Unit and most FIUs worldwide) has
    no public real-time submission API for reporting entities — the standard workflow is to
    generate this XML and upload it through the goAML web client. This function produces
    that file; delivery is a manual step outside this system's control.
    """
    from xml.sax.saxutils import escape

    t = monitored_transaction
    subject = t.subject
    report_type = 'STR' if t.status != 'reported' else 'STR'  # Suspicious Transaction Report

    party_xml = ''
    if subject:
        party_xml = f"""
    <involved_party>
      <full_name>{escape(subject.full_name)}</full_name>
      <id_type>{escape(subject.id_type)}</id_type>
      <id_number>{escape(subject.id_number)}</id_number>
      <nationality>{escape(subject.nationality)}</nationality>
      <is_pep>{'true' if subject.is_pep else 'false'}</is_pep>
    </involved_party>"""

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<report type="{report_type}" xmlns="urn:goAML:report">
  <reporting_entity>
    <name>PropManager ZW</name>
    <report_date>{datetime.date.today().isoformat()}</report_date>
  </reporting_entity>
  <transaction>
    <transaction_id>{t.pk}</transaction_id>
    <transaction_date>{t.transaction_date.isoformat()}</transaction_date>
    <amount>{t.amount}</amount>
    <currency>{escape(t.currency)}</currency>
    <payment_method>{escape(t.payment_method)}</payment_method>
    <source_type>{escape(t.source_type)}</source_type>
    <description>{escape(t.description)}</description>
    <risk_level>{escape(t.risk_level)}</risk_level>
    <indicators>{','.join(t.flags)}</indicators>
  </transaction>{party_xml}
</report>
"""
