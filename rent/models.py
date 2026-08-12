from django.db import models
from django.conf import settings
from decimal import Decimal
import uuid
import datetime


class Invoice(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('paid', 'Paid'),
        ('partial', 'Partially Paid'),
        ('overdue', 'Overdue'),
        ('cancelled', 'Cancelled'),
    ]

    CURRENCY_CHOICES = [('USD', 'USD'), ('ZiG', 'ZiG')]

    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name='rent_invoices')
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='invoices', null=True, blank=True)
    unit = models.ForeignKey('properties.Unit', on_delete=models.CASCADE,
                              related_name='invoices', null=True, blank=True)
    invoice_number = models.CharField(max_length=50, unique=True, blank=True)
    period_start = models.DateField()
    period_end = models.DateField()
    due_date = models.DateField()
    rent_amount = models.DecimalField(max_digits=10, decimal_places=2)
    late_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    other_charges = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    currency = models.CharField(max_length=5, choices=CURRENCY_CHOICES, default='USD',
                                 help_text='Currency the tenant is billed in')
    exchange_rate = models.ForeignKey('currency.ExchangeRate', on_delete=models.SET_NULL,
                                       null=True, blank=True, related_name='invoices')
    total_amount_zig = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'),
                                            help_text='total_amount converted to ZiG at time of invoicing')
    recurring_profile = models.ForeignKey('RecurringInvoiceProfile', on_delete=models.SET_NULL,
                                           null=True, blank=True, related_name='generated_invoices')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        self.total_amount = self.rent_amount + self.late_fee + self.other_charges
        if self.status == 'paid':
            self.paid_amount = self.total_amount
        if self.exchange_rate:
            self.total_amount_zig = self.exchange_rate.convert_usd_to_zig(self.total_amount)
        if not self.invoice_number:
            prefix = datetime.date.today().strftime('%Y%m')
            self.invoice_number = f"INV-{prefix}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice_number} - {self.tenant}"


class RecurringInvoiceProfile(models.Model):
    """Recurring Invoicing: auto-generates rent invoices for an active lease on a fixed
    schedule. Picked up by the generate_recurring_invoices management command (cron-triggered,
    same pattern as lettings.process_scheduled_bulk_payments)."""
    FREQUENCY_CHOICES = [('monthly', 'Monthly'), ('quarterly', 'Quarterly')]

    lease = models.ForeignKey('leases.Lease', on_delete=models.CASCADE, related_name='invoice_profiles')
    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, default='monthly')
    billing_day = models.PositiveSmallIntegerField(default=1, help_text='Day of month invoices are generated (1-28)')
    due_in_days = models.PositiveSmallIntegerField(default=5, help_text='Days after generation the invoice is due')
    currency = models.CharField(max_length=5, choices=Invoice.CURRENCY_CHOICES, default='USD')
    other_charges = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    auto_generate_disbursement = models.BooleanField(
        default=False, help_text='When an invoice from this profile is paid in full, '
                                  'auto-run the landlord disbursement calculation for that period')
    is_active = models.BooleanField(default=True)
    next_generation_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['next_generation_date']

    def __str__(self):
        return f"Recurring invoice — {self.lease} ({self.frequency})"

    def advance_next_date(self):
        months = 3 if self.frequency == 'quarterly' else 1
        month = self.next_generation_date.month - 1 + months
        year = self.next_generation_date.year + month // 12
        month = month % 12 + 1
        import calendar
        day = min(self.billing_day, calendar.monthrange(year, month)[1])
        self.next_generation_date = datetime.date(year, month, day)


class Payment(models.Model):
    METHOD_CHOICES = [
        ('bank_transfer', 'Bank Transfer / RTGS'),
        ('ecocash', 'EcoCash'),
        ('zipit', 'Zipit'),
        ('swipe', 'Swipe (POS)'),
        ('cash', 'Cash (USD)'),
        ('cheque', 'Cheque'),
        ('online', 'Online Portal'),
    ]
    STATUS_CHOICES = [('posted', 'Posted'), ('reversed', 'Reversed')]

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='bank_transfer')
    reference_number = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='posted')
    reversed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='payments_reversed')
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name='recorded_payments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date']

    def __str__(self):
        return f"Payment ${self.amount} for {self.invoice.invoice_number}"


class Refund(models.Model):
    """A refund of money already collected — distinct from Payment.reverse(): a reversal
    means the payment was erroneous/duplicate and should never have counted; a refund means
    the payment was genuinely valid but money is legitimately being returned (overpayment,
    lease termination, etc.). Requested -> Approved -> Processed, each a separate actor."""
    STATUS_CHOICES = [
        ('requested', 'Requested'), ('approved', 'Approved'),
        ('processed', 'Processed'), ('rejected', 'Rejected'),
    ]

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='refunds')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='requested')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                      null=True, related_name='refunds_requested')
    requested_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='refunds_approved')
    approved_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    refund_method = models.CharField(max_length=50, blank=True)
    refund_reference = models.CharField(max_length=100, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"Refund ${self.amount} for {self.payment} ({self.status})"


class LateFeeRule(models.Model):
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='late_fee_rules', null=True, blank=True)
    name = models.CharField(max_length=100)
    grace_period_days = models.PositiveIntegerField(default=5)
    fee_type = models.CharField(max_length=10,
                                choices=[('flat', 'Flat Amount'), ('percent', 'Percentage')],
                                default='flat')
    fee_amount = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('50.00'))
    max_fee = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} - {self.fee_type} ${self.fee_amount}"
