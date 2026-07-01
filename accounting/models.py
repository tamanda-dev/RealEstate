from django.db import models
from django.conf import settings
from decimal import Decimal


class Account(models.Model):
    TYPE_CHOICES = [
        ('asset', 'Asset'),
        ('liability', 'Liability'),
        ('equity', 'Equity'),
        ('revenue', 'Revenue'),
        ('expense', 'Expense'),
    ]
    SUBTYPE_CHOICES = [
        ('trust', 'Trust Account'),
        ('operating', 'Operating'),
        ('savings', 'Savings'),
        ('checking', 'Checking'),
        ('accounts_receivable', 'Accounts Receivable'),
        ('accounts_payable', 'Accounts Payable'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=200)
    account_number = models.CharField(max_length=50, unique=True)
    account_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    subtype = models.CharField(max_length=30, choices=SUBTYPE_CHOICES, default='other')
    description = models.TextField(blank=True)
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))
    is_trust_account = models.BooleanField(default=False)
    property = models.ForeignKey('properties.Property', on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name='accounts')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['account_type', 'name']

    def __str__(self):
        return f"{self.account_number} - {self.name}"


class JournalEntry(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('voided', 'Voided'),
    ]

    entry_number = models.CharField(max_length=50, unique=True)
    date = models.DateField()
    description = models.CharField(max_length=500)
    reference = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name='journal_entries')
    posted_at = models.DateTimeField(null=True, blank=True)
    property = models.ForeignKey('properties.Property', on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name='journal_entries')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Journal Entries'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"JE#{self.entry_number} - {self.description}"

    def total_debits(self):
        return sum(line.debit for line in self.lines.all())

    def total_credits(self):
        return sum(line.credit for line in self.lines.all())

    def is_balanced(self):
        return self.total_debits() == self.total_credits()


class JournalLine(models.Model):
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='lines')
    description = models.CharField(max_length=300, blank=True)
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))

    def __str__(self):
        return f"Line: {self.account} Dr:{self.debit} Cr:{self.credit}"


class TrustTransaction(models.Model):
    TYPE_CHOICES = [
        ('deposit', 'Deposit'),
        ('withdrawal', 'Withdrawal'),
        ('transfer', 'Transfer'),
    ]

    account = models.ForeignKey(Account, on_delete=models.CASCADE,
                                 related_name='trust_transactions',
                                 limit_choices_to={'is_trust_account': True})
    transaction_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField()
    description = models.CharField(max_length=500)
    client_name = models.CharField(max_length=200)
    reference = models.CharField(max_length=100, blank=True)
    property = models.ForeignKey('properties.Property', on_delete=models.SET_NULL,
                                  null=True, blank=True)
    reconciled = models.BooleanField(default=False)
    reconciled_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name='trust_transactions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"Trust {self.transaction_type} ${self.amount} - {self.client_name}"


class Reconciliation(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='reconciliations')
    period_start = models.DateField()
    period_end = models.DateField()
    statement_balance = models.DecimalField(max_digits=14, decimal_places=2)
    book_balance = models.DecimalField(max_digits=14, decimal_places=2)
    difference = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))
    is_reconciled = models.BooleanField(default=False)
    reconciled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                      null=True, related_name='reconciliations')
    reconciled_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-period_end']

    def __str__(self):
        return f"Recon: {self.account} ({self.period_start} - {self.period_end})"


class AuditLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=50)
    model_name = models.CharField(max_length=100)
    object_id = models.CharField(max_length=50)
    description = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user} - {self.action} on {self.model_name}#{self.object_id}"
