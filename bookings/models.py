from django.db import models
from django.conf import settings
from decimal import Decimal
import uuid, datetime


class Quotation(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'), ('sent', 'Sent'), ('accepted', 'Accepted'),
        ('revised', 'Revised'), ('expired', 'Expired'), ('cancelled', 'Cancelled'),
    ]

    reference = models.CharField(max_length=50, unique=True, blank=True)
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='quotations')
    unit = models.ForeignKey('properties.Unit', on_delete=models.SET_NULL, null=True, blank=True, related_name='quotations')
    contact = models.ForeignKey('sales.Contact', on_delete=models.SET_NULL, null=True, blank=True, related_name='quotations')
    lead = models.ForeignKey('crm.Lead', on_delete=models.SET_NULL, null=True, blank=True, related_name='quotations')
    generated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='quotations')

    base_price_usd = models.DecimalField(max_digits=14, decimal_places=2)
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    discount_amount_usd = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    discount_reason = models.CharField(max_length=200, blank=True)

    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('15.5'))
    stamp_duty_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    registration_fees_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    legal_fees_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    parking_cost_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    other_charges_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    other_charges_description = models.CharField(max_length=200, blank=True)

    subtotal_usd = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))
    vat_amount_usd = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    total_usd = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))

    exchange_rate = models.ForeignKey('currency.ExchangeRate', on_delete=models.SET_NULL,
                                       null=True, blank=True, related_name='quotations')
    total_zig = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0'))

    deal_type = models.CharField(max_length=10, choices=[('sale', 'Sale'), ('lease', 'Lease')], default='sale')
    valid_days = models.PositiveIntegerField(default=14)
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"QTE-{datetime.date.today().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
        if not self.valid_until:
            self.valid_until = datetime.date.today() + datetime.timedelta(days=self.valid_days)
        discounted = self.base_price_usd - self.discount_amount_usd
        extras = (self.stamp_duty_usd + self.registration_fees_usd +
                  self.legal_fees_usd + self.parking_cost_usd + self.other_charges_usd)
        self.vat_amount_usd = round(discounted * self.vat_rate / 100, 2)
        self.subtotal_usd = discounted + extras
        self.total_usd = self.subtotal_usd + self.vat_amount_usd
        if self.exchange_rate:
            self.total_zig = self.exchange_rate.convert_usd_to_zig(self.total_usd)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference} — {self.property.name} ${self.total_usd}"


class Reservation(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending Payment'), ('active', 'Active'),
        ('converted', 'Converted'), ('expired', 'Expired'), ('cancelled', 'Cancelled'),
    ]

    reservation_number = models.CharField(max_length=50, unique=True, blank=True)
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='reservations')
    unit = models.ForeignKey('properties.Unit', on_delete=models.SET_NULL, null=True, blank=True, related_name='reservations')
    contact = models.ForeignKey('sales.Contact', on_delete=models.SET_NULL, null=True, blank=True, related_name='reservations')
    lead = models.ForeignKey('crm.Lead', on_delete=models.SET_NULL, null=True, blank=True, related_name='reservations')
    quotation = models.ForeignKey(Quotation, on_delete=models.SET_NULL, null=True, blank=True, related_name='reservations')
    deal_type = models.CharField(max_length=10, choices=[('sale', 'Sale'), ('lease', 'Lease')], default='sale')

    token_amount_usd = models.DecimalField(max_digits=10, decimal_places=2)
    token_currency = models.CharField(max_length=5, choices=[('USD', 'USD'), ('ZiG', 'ZiG')], default='USD')
    token_amount_zig = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))
    payment_received_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=50, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)

    valid_until = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reserved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='reservations')
    expiry_reminder_sent = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.reservation_number:
            self.reservation_number = f"RES-{datetime.date.today().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
        if self.status == 'active' and self.valid_until < datetime.date.today():
            self.status = 'expired'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reservation_number} — {self.property.name}"


class HandoverChecklist(models.Model):
    TYPE_CHOICES = [
        ('move_in', 'Move-In'), ('move_out', 'Move-Out'),
        ('sale_handover', 'Sale Handover'), ('mid_lease', 'Mid-Lease Inspection'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'), ('in_progress', 'In Progress'),
        ('passed', 'Passed'), ('failed', 'Snags Outstanding'), ('signed_off', 'Signed Off'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='handovers')
    unit = models.ForeignKey('properties.Unit', on_delete=models.SET_NULL, null=True, blank=True, related_name='handovers')
    lease = models.ForeignKey('leases.Lease', on_delete=models.SET_NULL, null=True, blank=True, related_name='handovers')
    handover_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='move_in')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    inspector = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='inspections')
    inspection_date = models.DateField(null=True, blank=True)
    tenant_present = models.BooleanField(default=False)
    landlord_present = models.BooleanField(default=False)
    key_handover_date = models.DateField(null=True, blank=True)
    keys_count = models.PositiveIntegerField(default=2)
    electricity_meter_reading = models.CharField(max_length=50, blank=True)
    water_meter_reading = models.CharField(max_length=50, blank=True)
    overall_notes = models.TextField(blank=True)
    signed_off_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.handover_type} — {self.property.name} ({self.status})"


class HandoverItem(models.Model):
    CATEGORY_CHOICES = [
        ('structural', 'Structural'), ('electrical', 'Electrical'), ('plumbing', 'Plumbing'),
        ('fittings', 'Fittings'), ('appliances', 'Appliances'), ('keys', 'Keys'),
        ('documents', 'Documents'), ('garden', 'Garden'), ('other', 'Other'),
    ]
    CONDITION_CHOICES = [
        ('pass', 'Satisfactory'), ('minor', 'Minor Issue'),
        ('fail', 'Unsatisfactory / Snag'), ('na', 'N/A'),
    ]

    checklist = models.ForeignKey(HandoverChecklist, on_delete=models.CASCADE, related_name='items')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='structural')
    description = models.CharField(max_length=300)
    condition = models.CharField(max_length=10, choices=CONDITION_CHOICES, default='pass')
    notes = models.CharField(max_length=500, blank=True)
    image = models.ImageField(upload_to='handover/', blank=True, null=True)
    estimated_repair_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    resolved = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.description} — {self.condition}"
