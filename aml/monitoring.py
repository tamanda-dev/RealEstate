"""Transaction Monitoring engine: rule-based AML screening applied at each money-movement
call site (rent payments, trust deposits, property sale closings, ...). Kept separate from
views.py so it can be unit-tested and called from multiple apps without circular imports.
"""
import datetime
from decimal import Decimal
from xml.dom import minidom
from xml.etree import ElementTree as ET

from django.conf import settings

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
        if subject.residency_status == 'non_resident':
            flags.append('NON_RESIDENT_BUYER')
        if subject.watchlist_matches:
            flags.append('WATCHLIST_MATCH')
        if subject.entity_type != 'individual' and not subject.beneficial_owners.exists():
            flags.append('BENEFICIAL_OWNERSHIP_MISSING')

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
        # PEP/jurisdiction/watchlist/beneficial-ownership gaps are already priced into the
        # profile's own calculate_risk_score() — only bump for signals specific to *this*
        # transaction, so a subject's score doesn't get re-penalized for the same static
        # fact every time they make another payment.
        bump = {'LARGE_TRANSACTION': 10, 'LARGE_CASH': 10, 'STRUCTURING': 25,
                'PEP_INVOLVED': 0, 'HIGH_RISK_JURISDICTION': 0, 'KYC_NOT_VERIFIED': 5,
                'NON_RESIDENT_BUYER': 0, 'WATCHLIST_MATCH': 0, 'BENEFICIAL_OWNERSHIP_MISSING': 0}
        points = sum(bump.get(f, 5) for f in flags)
        if points:
            subject.bump_risk_score(points)

    return monitored


def _risk_level_for_flags(flags):
    if 'WATCHLIST_MATCH' in flags or 'STRUCTURING' in flags or ('PEP_INVOLVED' in flags and 'LARGE_TRANSACTION' in flags):
        return 'critical'
    if 'PEP_INVOLVED' in flags or 'HIGH_RISK_JURISDICTION' in flags or 'BENEFICIAL_OWNERSHIP_MISSING' in flags:
        return 'high'
    if len(flags) >= 2:
        return 'high'
    return 'medium'


# ── goAML reference-table mappings ──────────────────────────────────────────────
# The UNODC goAML XSD structure (element names/nesting used below) is a fixed public
# standard, but the *values* several fields must take come from reference tables each FIU
# maintains for its registered reporting entities (RBZ's FIU issues these on goAML portal
# registration — they are not publicly documented). The mappings below are best-effort
# placeholders using goAML's common convention across other FIU deployments; confirm the
# real codes against RBZ's published reference tables before relying on this for a live
# submission — an unmapped/incorrect code will fail XSD validation on upload just like an
# empty one would.
GOAML_ID_TYPE_CODES = {
    'national_id': 'ID_CARD',
    'passport': 'PASSPORT',
    'drivers_license': 'DRIVING_LICENSE',
    'company_reg': 'OTHER',
}
GOAML_TRANSMODE_CODES = {
    'cash': 'CASH',
    'bank_transfer': 'ELEC',
    'mobile_money': 'ELEC',
    'card': 'ELEC',
    'cheque': 'CHEQUE',
}
GOAML_FUNDS_CODES = {
    'cash': 'CASH',
    'bank_transfer': 'ACCOUNT',
    'mobile_money': 'ACCOUNT',
    'card': 'ACCOUNT',
    'cheque': 'CHEQUE',
}
# ISO 3166-1 alpha-2 — extend as KYC subjects from other countries are onboarded.
GOAML_COUNTRY_CODES = {
    'zimbabwe': 'ZW', 'south africa': 'ZA', 'botswana': 'BW', 'zambia': 'ZM',
    'mozambique': 'MZ', 'united kingdom': 'GB', 'united states': 'US',
}


def _country_code(name):
    return GOAML_COUNTRY_CODES.get((name or '').strip().lower(), (name or '')[:2].upper() or 'ZW')


def _split_name(full_name):
    parts = (full_name or '').split(None, 1)
    return (parts[0], parts[1]) if len(parts) == 2 else (parts[0] if parts else '', '')


def _sub(parent, tag, text=None):
    """Add a child element. Skips it entirely when text is falsy — most goAML fields are
    optional, and an empty mandatory element is no more valid than a missing one."""
    if text is None or text == '':
        return None
    el = ET.SubElement(parent, tag)
    el.text = str(text)
    return el


def _add_person(parent, tag, profile):
    """Build a t_person block (identification + address) for a KYC subject."""
    person = ET.SubElement(parent, tag)
    first_name, last_name = _split_name(profile.full_name)
    _sub(person, 'first_name', first_name)
    _sub(person, 'last_name', last_name or first_name)
    if profile.date_of_birth:
        _sub(person, 'birthdate', profile.date_of_birth.isoformat())
    _sub(person, 'occupation', profile.occupation)
    _sub(person, 'nationality1', _country_code(profile.nationality))
    if profile.id_number:
        identification = ET.SubElement(person, 'identification')
        _sub(identification, 'type', GOAML_ID_TYPE_CODES.get(profile.id_type, 'OTHER'))
        _sub(identification, 'number', profile.id_number)
        _sub(identification, 'issue_country', _country_code(profile.nationality))
        if profile.expiry_date:
            _sub(identification, 'expiry_date', profile.expiry_date.isoformat())
    return person


def _build_reason(t):
    """goAML requires a free-text narrative explaining the grounds for suspicion (`reason`,
    mandatory, max 4000 chars) — auto-drafted from the triggered rules; a compliance officer
    should review/extend this before submission, same as any STR narrative."""
    flag_text = ', '.join(t.flags) if t.flags else 'threshold review'
    parts = [
        f"Automated AML screening flagged this {t.get_source_type_display().lower()} "
        f"({t.amount} {t.currency} on {t.transaction_date.isoformat()}) for: {flag_text}.",
    ]
    if t.description:
        parts.append(f"Transaction context: {t.description}")
    if t.review_notes:
        parts.append(f"Compliance officer notes: {t.review_notes}")
    return ' '.join(parts)


def _timezone_now_iso():
    from django.utils import timezone
    return timezone.now().strftime('%Y-%m-%dT%H:%M:%S')


def generate_goaml_xml(monitored_transaction):
    """Render a goAML XML report for one flagged transaction, using the element names and
    nesting defined by UNODC's goAML XSD (report > transaction > t_from/t_to > person, with
    identification/address sub-blocks) rather than an ad-hoc schema.

    goAML has no public real-time submission API for reporting entities — the standard
    workflow is to generate this XML and upload it through the goAML web client. This
    function produces that file; delivery is a manual step outside this system's control.
    Configure GOAML_REPORTING_ENTITY_ID etc. in settings once RBZ issues your registration —
    see the reference-table note above the mapping dicts for the fields you'll still need to
    confirm against RBZ's own code lists before a submission will pass XSD validation.
    """
    t = monitored_transaction
    subject = t.subject

    # A pure currency-threshold breach with no suspicion indicators is a routine Currency
    # Transaction Report; anything with a behavioural flag (PEP, structuring, jurisdiction,
    # unverified KYC) is a Suspicious Transaction Report.
    suspicious_flags = set(t.flags) - {'LARGE_TRANSACTION'}
    report_code = 'STR' if suspicious_flags else 'CTR'

    local_currency = getattr(settings, 'GOAML_LOCAL_CURRENCY', 'ZWG')
    amount_local, fx_rate = t.amount, None
    reported_currency = t.currency  # what amount_local is actually denominated in below
    if t.currency != local_currency and local_currency == 'ZWG':
        from currency.models import ExchangeRate
        rate = ExchangeRate.get_latest()
        if rate:
            amount_local = rate.convert_usd_to_zig(t.amount)
            fx_rate = rate.usd_to_zig
            reported_currency = local_currency
        # No rate configured — fall through and report in the transaction's own currency
        # rather than mislabeling the raw amount as ZWG when it was never converted.

    report = ET.Element('report')
    _sub(report, 'rentity_id', getattr(settings, 'GOAML_REPORTING_ENTITY_ID', ''))
    _sub(report, 'rentity_branch', getattr(settings, 'GOAML_REPORTING_ENTITY_BRANCH', ''))
    _sub(report, 'submission_code', 'E')  # E = manually entered/generated, not bulk-uploaded by the FIU itself
    _sub(report, 'report_code', report_code)
    _sub(report, 'entity_reference', t.goaml_reference or f'TXN-{t.pk}')
    _sub(report, 'submission_date', _timezone_now_iso())
    _sub(report, 'currency_code_local', reported_currency)

    if t.reviewed_by:
        first_name, last_name = _split_name(t.reviewed_by.get_full_name() or t.reviewed_by.username)
        reporting_person = ET.SubElement(report, 'reporting_person')
        _sub(reporting_person, 'first_name', first_name)
        _sub(reporting_person, 'last_name', last_name or first_name)
        _sub(reporting_person, 'email', t.reviewed_by.email)

    _sub(report, 'reason', _build_reason(t))

    if t.flags:
        indicators = ET.SubElement(report, 'report_indicators')
        for flag in t.flags:
            _sub(indicators, 'indicator', flag)

    transaction = ET.SubElement(report, 'transaction')
    _sub(transaction, 'transactionnumber', str(t.pk))
    _sub(transaction, 'transaction_description', t.description or t.get_source_type_display())
    _sub(transaction, 'date_transaction', t.transaction_date.isoformat())
    _sub(transaction, 'transmode_code', GOAML_TRANSMODE_CODES.get(t.payment_method, 'OTHER'))
    _sub(transaction, 'amount_local', str(amount_local))

    t_from = ET.SubElement(transaction, 't_from')
    _sub(t_from, 'from_funds_code', GOAML_FUNDS_CODES.get(t.payment_method, 'OTHER'))
    if fx_rate is not None:
        fx = ET.SubElement(t_from, 'from_foreign_currency')
        _sub(fx, 'foreign_currency_code', t.currency)
        _sub(fx, 'foreign_amount', str(t.amount))
        _sub(fx, 'foreign_exchange_rate', str(fx_rate))
    if subject:
        _add_person(t_from, 'from_person', subject)
        _sub(t_from, 'from_country', _country_code(subject.nationality))

    t_to = ET.SubElement(transaction, 't_to')
    t_to_entity = ET.SubElement(t_to, 'to_entity')
    _sub(t_to_entity, 'name', getattr(settings, 'GOAML_REPORTING_ENTITY_NAME', 'PropManager ZW'))

    return minidom.parseString(ET.tostring(report, encoding='unicode')).toprettyxml(indent='  ')
