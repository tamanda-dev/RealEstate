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
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        self.total_amount = self.rent_amount + self.late_fee + self.other_charges
        if not self.invoice_number:
            prefix = datetime.date.today().strftime('%Y%m')
            self.invoice_number = f"INV-{prefix}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice_number} - {self.tenant}"


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

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='bank_transfer')
    reference_number = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name='recorded_payments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date']

    def __str__(self):
        return f"Payment ${self.amount} for {self.invoice.invoice_number}"


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
