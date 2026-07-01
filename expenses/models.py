from django.db import models
from django.conf import settings
from decimal import Decimal


class ExpenseCategory(models.Model):
    TYPE_CHOICES = [
        ('insurance', 'Insurance (Old Mutual / ZB / Zimnat)'),
        ('rates', 'City Council Rates'),
        ('utilities', 'Utilities (ZESA / ZINWA)'),
        ('mortgage', 'Mortgage / Bond Repayment'),
        ('management', 'Management Fees'),
        ('repairs', 'Repairs & Maintenance'),
        ('landscaping', 'Landscaping'),
        ('council_levy', 'Council Levy / ZINARA'),
        ('advertising', 'Advertising'),
        ('legal', 'Legal & Professional'),
        ('accounting', 'Accounting / Audit'),
        ('supplies', 'Supplies'),
        ('security', 'Security (Securico / G4S)'),
        ('other', 'Other'),
    ]
    name = models.CharField(max_length=100)
    category_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='other')
    description = models.CharField(max_length=300, blank=True)
    is_tax_deductible = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'Expense Categories'
        ordering = ['category_type', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_category_type_display()})"


class OperatingExpense(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
    ]
    RECURRENCE_CHOICES = [
        ('none', 'One-Time'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('annually', 'Annually'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='operating_expenses')
    unit = models.ForeignKey('properties.Unit', on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='operating_expenses')
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT,
                                  related_name='expenses')
    vendor_name = models.CharField(max_length=200, blank=True)
    description = models.CharField(max_length=500)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    is_recurring = models.BooleanField(default=False)
    recurrence = models.CharField(max_length=15, choices=RECURRENCE_CHOICES, default='none')
    receipt = models.FileField(upload_to='expense_receipts/', null=True, blank=True)
    notes = models.TextField(blank=True)
    paid_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=50, blank=True)
    reference_number = models.CharField(max_length=100, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name='created_expenses')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-expense_date', '-created_at']

    def __str__(self):
        return f"{self.category.name} - ${self.amount} ({self.expense_date})"


class ExpenseBudget(models.Model):
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='expense_budgets')
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE,
                                  related_name='budgets')
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField(null=True, blank=True,
                                         help_text='Leave blank for annual budget')
    budgeted_amount = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        unique_together = ['property', 'category', 'year', 'month']
        ordering = ['-year', 'month']

    def __str__(self):
        period = f"{self.year}/{self.month:02d}" if self.month else str(self.year)
        return f"Budget: {self.property.name} - {self.category.name} ({period})"
