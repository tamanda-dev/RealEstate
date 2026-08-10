import datetime
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

# Rule-based risk scoring thresholds (Zimbabwe FIU / RBZ guidance uses USD-equivalent
# thresholds for currency transaction reporting; kept as module constants so they can be
# tuned without touching the scoring logic itself).
CTR_THRESHOLD_USD = Decimal('10000')       # Currency Transaction Report threshold
LARGE_CASH_THRESHOLD_USD = Decimal('5000')  # Cash-specific lower threshold
STRUCTURING_WINDOW_DAYS = 2
STRUCTURING_COUNT_THRESHOLD = 3

# FATF-style illustrative high-risk jurisdiction list — a real deployment would source this
# from the FATF/FIU published list and keep it current; this is a starting point, editable
# without a migration since it's just used for string matching against KYCProfile.nationality.
HIGH_RISK_COUNTRIES = {
    'north korea', 'iran', 'myanmar', 'afghanistan',
}


class KYCProfile(models.Model):
    """KYC verification record for one party to a transaction — either a platform User
    (tenant/landlord/buyer account) or a sales.Contact (buyer/seller who may not have a
    platform login). Exactly one of user/contact must be set."""
    ID_TYPE_CHOICES = [
        ('national_id', 'National ID'),
        ('passport', 'Passport'),
        ('drivers_license', "Driver's License"),
        ('company_reg', 'Company Registration'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending Verification'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
        ('expired', 'Expired'),
    ]
    RISK_RATING_CHOICES = [
        ('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('critical', 'Critical'),
    ]

    ENTITY_TYPE_CHOICES = [
        ('individual', 'Individual'),
        ('trust', 'Trust'),
        ('company', 'Company / Corporate'),
    ]
    RESIDENCY_CHOICES = [
        ('resident', 'Resident'),
        ('non_resident', 'Non-Resident'),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                 null=True, blank=True, related_name='kyc_profile')
    contact = models.OneToOneField('sales.Contact', on_delete=models.CASCADE,
                                    null=True, blank=True, related_name='kyc_profile')

    entity_type = models.CharField(max_length=10, choices=ENTITY_TYPE_CHOICES, default='individual')
    registration_number = models.CharField(
        max_length=100, blank=True,
        help_text='Company/trust registration number — required for entity_type != individual')

    full_name = models.CharField(max_length=200,
                                  help_text='Individual name, or registered trust/company name')
    id_type = models.CharField(max_length=20, choices=ID_TYPE_CHOICES, default='national_id')
    id_number = models.CharField(max_length=100)
    date_of_birth = models.DateField(null=True, blank=True)
    nationality = models.CharField(max_length=100, default='Zimbabwe')
    residency_status = models.CharField(max_length=15, choices=RESIDENCY_CHOICES, default='resident',
                                         help_text='Non-resident property buyers are a recognized FATF risk factor')
    occupation = models.CharField(max_length=150, blank=True)
    source_of_funds = models.TextField(blank=True)

    is_pep = models.BooleanField(default=False, verbose_name='Politically Exposed Person')
    pep_details = models.TextField(blank=True)

    id_document = models.FileField(upload_to='kyc_documents/id/', blank=True, null=True)
    proof_of_address = models.FileField(upload_to='kyc_documents/address/', blank=True, null=True)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='kyc_verifications')
    verified_at = models.DateTimeField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True,
                                    help_text='Re-verification due date (KYC records go stale)')

    risk_score = models.PositiveSmallIntegerField(default=0, help_text='0-100, higher = riskier')
    risk_rating = models.CharField(max_length=10, choices=RISK_RATING_CHOICES, default='low')

    watchlist_matches = models.JSONField(
        default=list, blank=True,
        help_text='Result of the most recent sanctions/PEP watchlist screening — '
                  'list of {entry_id, matched_name, score, list_source, entry_type}')
    watchlist_screened_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-risk_score', '-created_at']
        verbose_name = 'KYC Profile'
        verbose_name_plural = 'KYC Profiles'

    def clean(self):
        if bool(self.user_id) == bool(self.contact_id):
            raise ValidationError('Exactly one of user or contact must be set on a KYC profile.')
        if self.entity_type != 'individual' and not self.registration_number:
            raise ValidationError({
                'registration_number': 'Required for trust/company entities — capture the '
                                        'registration number as part of Customer Due Diligence.'
            })

    def __str__(self):
        return f"KYC: {self.full_name} ({self.risk_rating})"

    def calculate_risk_score(self):
        """Rule-based baseline score from the profile itself (0-60+). Transaction monitoring
        can push this higher via bump_risk_score() when suspicious activity is observed."""
        score = 0
        if self.is_pep:
            score += 40
        if self.nationality and self.nationality.strip().lower() in HIGH_RISK_COUNTRIES:
            score += 20
        if self.status != 'verified':
            score += 15
        if not self.id_document:
            score += 10
        if self.expiry_date and self.expiry_date < datetime.date.today():
            score += 15
        if self.residency_status == 'non_resident':
            score += 15
        if self.entity_type != 'individual':
            score += 10  # trusts/corporates obscure beneficial ownership — FATF-recognized risk
        if self.watchlist_matches:
            score += 35
        if self.pk:  # beneficial_owners is a related manager — only queryable once saved
            owners = self.beneficial_owners.all()
            if self.entity_type != 'individual' and not owners:
                score += 15  # entity buyer with no disclosed beneficial owners on file yet
            if any(o.is_pep or o.watchlist_matches for o in owners):
                score += 30
        self.risk_score = min(score, 100)
        self._apply_rating()
        return self.risk_score

    def bump_risk_score(self, points, save=True):
        self.risk_score = min(self.risk_score + points, 100)
        self._apply_rating()
        if save:
            self.save(update_fields=['risk_score', 'risk_rating'])

    def _apply_rating(self):
        if self.risk_score >= 75:
            self.risk_rating = 'critical'
        elif self.risk_score >= 50:
            self.risk_rating = 'high'
        elif self.risk_score >= 25:
            self.risk_rating = 'medium'
        else:
            self.risk_rating = 'low'

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class BeneficialOwner(models.Model):
    """CDD for trusts/corporate buyers: goAML and FATF both require the *natural persons*
    who ultimately own or control an entity buyer, not just the entity's own registration
    details. One KYCProfile with entity_type='trust'/'company' can have several of these."""
    kyc_profile = models.ForeignKey(KYCProfile, on_delete=models.CASCADE, related_name='beneficial_owners')
    full_name = models.CharField(max_length=200)
    id_type = models.CharField(max_length=20, choices=KYCProfile.ID_TYPE_CHOICES, default='national_id')
    id_number = models.CharField(max_length=100)
    nationality = models.CharField(max_length=100, default='Zimbabwe')
    date_of_birth = models.DateField(null=True, blank=True)
    ownership_percentage = models.DecimalField(
        max_digits=5, decimal_places=2,
        help_text='% ultimate beneficial ownership/control — goAML requires this per owner')
    is_pep = models.BooleanField(default=False, verbose_name='Politically Exposed Person')
    watchlist_matches = models.JSONField(
        default=list, blank=True,
        help_text='Result of screening this beneficial owner\'s own name against the watchlist')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ownership_percentage']

    def __str__(self):
        return f"{self.full_name} ({self.ownership_percentage}%) — {self.kyc_profile.full_name}"


class WatchlistEntry(models.Model):
    """One name on a sanctions/PEP watchlist, used for local fuzzy-match screening.

    This app has no live connection to a commercial screening provider (World-Check,
    ComplyAdvantage, etc. all require a paid subscription this deployment doesn't have) — it
    screens against whatever entries compliance staff have imported here, typically sourced
    from the free public OFAC SDN list and UN Security Council Consolidated List via CSV
    import (see WatchlistEntryViewSet.import_csv). Keeping the list current is a compliance
    process, not something this code can guarantee on its own."""
    SOURCE_CHOICES = [
        ('ofac_sdn', 'OFAC SDN List'),
        ('un_consolidated', 'UN Security Council Consolidated List'),
        ('local_pep', 'Local PEP List'),
        ('other', 'Other'),
    ]
    ENTRY_TYPE_CHOICES = [
        ('sanction', 'Sanctioned Entity/Individual'),
        ('pep', 'Politically Exposed Person'),
        ('other', 'Other'),
    ]

    full_name = models.CharField(max_length=300, db_index=True)
    aliases = models.TextField(blank=True, help_text='One alias per line')
    list_source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='other')
    entry_type = models.CharField(max_length=10, choices=ENTRY_TYPE_CHOICES, default='sanction')
    country = models.CharField(max_length=100, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    notes = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['full_name']
        verbose_name_plural = 'Watchlist Entries'

    def all_names(self):
        """Full name plus every alias, for matching."""
        names = [self.full_name]
        names += [a.strip() for a in self.aliases.splitlines() if a.strip()]
        return names

    def __str__(self):
        return f"{self.full_name} ({self.get_list_source_display()})"


class MonitoredTransaction(models.Model):
    """Transaction Monitoring: a financial movement that was screened against AML rules.
    Not every transaction in the system creates a row here — only those routed through
    aml.monitoring.screen_transaction() from the money-movement call sites (rent payments,
    trust deposits, property sale closings)."""
    SOURCE_CHOICES = [
        ('rent_payment', 'Rent Payment'),
        ('trust_deposit', 'Trust Account Deposit'),
        ('property_sale', 'Property Sale'),
        ('reservation_token', 'Reservation Token / Deposit'),
        ('landlord_disbursement', 'Landlord Disbursement'),
        ('buyer_offer', 'Buyer Offer (pre-sale screening)'),
        ('other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('flagged', 'Flagged — Pending Review'),
        ('cleared', 'Cleared'),
        ('reported', 'Reported to FIU (goAML)'),
    ]
    RISK_LEVEL_CHOICES = [
        ('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('critical', 'Critical'),
    ]

    subject = models.ForeignKey(KYCProfile, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='transactions')
    source_type = models.CharField(max_length=25, choices=SOURCE_CHOICES, default='other')
    source_id = models.PositiveIntegerField(null=True, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=5, default='USD')
    payment_method = models.CharField(max_length=50, blank=True)
    transaction_date = models.DateField()
    description = models.CharField(max_length=300, blank=True)

    flags = models.JSONField(default=list, help_text='List of triggered rule codes, e.g. ["LARGE_CASH"]')
    risk_level = models.CharField(max_length=10, choices=RISK_LEVEL_CHOICES, default='low')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='flagged')

    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='aml_reviews')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)

    reported_at = models.DateTimeField(null=True, blank=True)
    goaml_reference = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Monitored: ${self.amount} {self.currency} ({self.risk_level}) — {self.get_status_display()}"
