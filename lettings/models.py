from django.db import models
from django.conf import settings
from decimal import Decimal


class PropertyInspection(models.Model):
    TYPE_CHOICES = [
        ('routine', 'Routine Inspection'),
        ('move_in', 'Move-In Inspection'),
        ('move_out', 'Move-Out Inspection'),
        ('annual', 'Annual Inspection'),
        ('pre_sale', 'Pre-Sale Inspection'),
        ('maintenance', 'Maintenance Follow-Up'),
        ('compliance', 'Compliance / Insurance'),
    ]
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('overdue', 'Overdue'),
        ('cancelled', 'Cancelled'),
    ]
    CONDITION_CHOICES = [
        ('excellent', 'Excellent'), ('good', 'Good'),
        ('fair', 'Fair'), ('poor', 'Poor'), ('na', 'N/A'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='inspections')
    unit = models.ForeignKey('properties.Unit', on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='inspections')
    lease = models.ForeignKey('leases.Lease', on_delete=models.SET_NULL,
                               null=True, blank=True, related_name='inspections')
    valuation = models.ForeignKey('valuation.Valuation', on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='inspections',
                                   help_text='Link this inspection into a valuation, feeding its condition score into the AVM')
    inspection_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='routine')
    scheduled_date = models.DateField()
    actual_date = models.DateField(null=True, blank=True)
    inspector = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name='property_inspections')
    tenant_notified = models.BooleanField(default=False)
    tenant_present = models.BooleanField(default=False)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='scheduled')
    overall_condition = models.CharField(max_length=15, choices=CONDITION_CHOICES, default='na')
    condition_score = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True,
                                           help_text='Automated 0-100 score computed from checklist items')
    report_summary = models.TextField(blank=True)
    action_required = models.BooleanField(default=False)
    action_description = models.TextField(blank=True)
    next_inspection_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['scheduled_date']

    def __str__(self):
        return f"{self.inspection_type} — {self.property.name} ({self.scheduled_date})"

    def recalculate_score(self):
        """Automated scoring: average the numeric condition value of every rated checklist
        item (N/A items are excluded), then derive the overall_condition bucket from it."""
        items = self.checklist_items.exclude(condition='na')
        if not items.exists():
            self.condition_score = None
            return
        total = sum(item.condition_value() for item in items)
        self.condition_score = round(Decimal(total) / items.count(), 1)
        if self.condition_score >= 85:
            self.overall_condition = 'excellent'
        elif self.condition_score >= 65:
            self.overall_condition = 'good'
        elif self.condition_score >= 40:
            self.overall_condition = 'fair'
        else:
            self.overall_condition = 'poor'


class InspectionChecklistItem(models.Model):
    """One line item on a digital inspection sheet — the building blocks the
    automated scoring engine (PropertyInspection.recalculate_score) aggregates."""
    CATEGORY_CHOICES = [
        ('structural', 'Structural'), ('roofing', 'Roofing'), ('electrical', 'Electrical'),
        ('plumbing', 'Plumbing'), ('hvac', 'HVAC'), ('interior', 'Interior Finishes'),
        ('exterior', 'Exterior / Facade'), ('safety', 'Safety & Compliance'),
        ('appliances', 'Appliances & Fixtures'), ('grounds', 'Grounds / Landscaping'),
        ('other', 'Other'),
    ]
    CONDITION_CHOICES = [
        ('excellent', 'Excellent'), ('good', 'Good'),
        ('fair', 'Fair'), ('poor', 'Poor'), ('na', 'N/A'),
    ]
    CONDITION_VALUES = {'excellent': 100, 'good': 75, 'fair': 50, 'poor': 25}

    inspection = models.ForeignKey(PropertyInspection, on_delete=models.CASCADE,
                                    related_name='checklist_items')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    item_name = models.CharField(max_length=200)
    condition = models.CharField(max_length=10, choices=CONDITION_CHOICES, default='na')
    notes = models.CharField(max_length=300, blank=True)
    requires_action = models.BooleanField(default=False)

    class Meta:
        ordering = ['category', 'item_name']

    def condition_value(self):
        return self.CONDITION_VALUES.get(self.condition, 0)

    def __str__(self):
        return f"{self.item_name} ({self.condition}) — {self.inspection}"


class LandlordDisbursement(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('approved', 'Approved'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='disbursements')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='disbursements')
    period_month = models.PositiveIntegerField(help_text='1–12')
    period_year = models.PositiveIntegerField()

    gross_rent_usd = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    agent_commission_rate = models.DecimalField(max_digits=5, decimal_places=2,
                                                 default=Decimal('10'),
                                                 help_text='% of gross rent')
    agent_commission_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('15.5'),
                                    help_text='ZIMRA VAT on commission %')
    vat_on_commission_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    other_deductions_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    other_deductions_description = models.CharField(max_length=300, blank=True)
    repairs_deducted_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    net_to_landlord_usd = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))

    # ZiG equivalent
    exchange_rate = models.ForeignKey('currency.ExchangeRate', on_delete=models.SET_NULL,
                                       null=True, blank=True)
    net_to_landlord_zig = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='draft')
    paid_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=50, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    generated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                      null=True, related_name='generated_disbursements')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['property', 'period_month', 'period_year']
        ordering = ['-period_year', '-period_month']

    def calculate(self):
        gross = Decimal(str(self.gross_rent_usd))
        comm_rate = Decimal(str(self.agent_commission_rate))
        vat_rate = Decimal(str(self.vat_rate))
        other = Decimal(str(self.other_deductions_usd))
        repairs = Decimal(str(self.repairs_deducted_usd))

        self.agent_commission_usd = round(gross * comm_rate / 100, 2)
        self.vat_on_commission_usd = round(self.agent_commission_usd * vat_rate / 100, 2)
        self.net_to_landlord_usd = gross - self.agent_commission_usd - self.vat_on_commission_usd - other - repairs
        if self.exchange_rate:
            self.net_to_landlord_zig = self.exchange_rate.convert_usd_to_zig(self.net_to_landlord_usd)

    def save(self, *args, **kwargs):
        self.calculate()
        super().save(*args, **kwargs)

    def __str__(self):
        import calendar
        month_name = calendar.month_name[self.period_month]
        return f"Disbursement: {self.property.name} — {month_name} {self.period_year} (${self.net_to_landlord_usd})"


class BulkPaymentBatch(models.Model):
    """A batch of landlord disbursements queued for execution on a given date —
    either immediately or via a scheduler (see lettings/management/commands/process_scheduled_bulk_payments.py)."""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('scheduled', 'Scheduled'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]

    name = models.CharField(max_length=200)
    scheduled_date = models.DateField(help_text='Date this batch should execute')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='draft')
    payment_method = models.CharField(max_length=50, blank=True)
    payment_reference_prefix = models.CharField(max_length=50, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name='bulk_payment_batches')
    executed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-scheduled_date', '-created_at']

    def __str__(self):
        return f"{self.name} ({self.scheduled_date}) — {self.status}"

    @property
    def total_amount_usd(self):
        return sum((item.amount_usd for item in self.items.all()), Decimal('0'))


class BulkPaymentItem(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('failed', 'Failed'),
    ]

    batch = models.ForeignKey(BulkPaymentBatch, on_delete=models.CASCADE, related_name='items')
    disbursement = models.ForeignKey(LandlordDisbursement, on_delete=models.CASCADE,
                                      related_name='bulk_payment_items')
    amount_usd = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    failure_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        unique_together = ['batch', 'disbursement']

    def __str__(self):
        return f"{self.batch.name} — {self.disbursement} (${self.amount_usd})"
