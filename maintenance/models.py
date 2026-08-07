from django.db import models
from django.conf import settings
import datetime


class PreventiveSchedule(models.Model):
    FREQUENCY_CHOICES = [
        ('monthly', 'Monthly'), ('quarterly', 'Quarterly'),
        ('biannual', 'Bi-Annual'), ('annual', 'Annual'), ('custom', 'Custom (days)'),
    ]
    CATEGORY_CHOICES = [
        ('hvac', 'HVAC / Air Conditioning'), ('electrical', 'Electrical'),
        ('plumbing', 'Plumbing'), ('structural', 'Structural'),
        ('fire_safety', 'Fire Safety'), ('borehole', 'Borehole / Water'),
        ('solar', 'Solar / Generator'), ('lifts', 'Lifts / Elevators'),
        ('landscaping', 'Landscaping'), ('pest_control', 'Pest Control'),
        ('security', 'Security Systems'), ('other', 'Other'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='preventive_schedules')
    task_name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    description = models.TextField(blank=True)
    frequency = models.CharField(max_length=15, choices=FREQUENCY_CHOICES, default='annual')
    interval_days = models.PositiveIntegerField(null=True, blank=True,
                                                 help_text='Only for custom frequency')
    last_completed = models.DateField(null=True, blank=True)
    next_due = models.DateField(null=True, blank=True)
    vendor = models.ForeignKey('Vendor', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='preventive_schedules')
    estimated_cost_usd = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    auto_create_work_order = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['next_due', 'property']

    FREQUENCY_DAYS = {'monthly': 30, 'quarterly': 90, 'biannual': 180, 'annual': 365}

    def calculate_next_due(self):
        base = self.last_completed or datetime.date.today()
        days = self.interval_days if self.frequency == 'custom' else self.FREQUENCY_DAYS.get(self.frequency, 365)
        return base + datetime.timedelta(days=days)

    def save(self, *args, **kwargs):
        if not self.next_due:
            self.next_due = self.calculate_next_due()
        super().save(*args, **kwargs)

    def is_overdue(self):
        return self.next_due and self.next_due < datetime.date.today()

    def days_until_due(self):
        if self.next_due:
            return (self.next_due - datetime.date.today()).days
        return None

    def __str__(self):
        return f"{self.task_name} — {self.property.name} (due {self.next_due})"


class Vendor(models.Model):
    CATEGORY_CHOICES = [
        ('plumbing', 'Plumbing'),
        ('electrical', 'Electrical'),
        ('hvac', 'HVAC'),
        ('painting', 'Painting'),
        ('landscaping', 'Landscaping'),
        ('cleaning', 'Cleaning'),
        ('roofing', 'Roofing'),
        ('general', 'General Contractor'),
        ('pest_control', 'Pest Control'),
        ('locksmith', 'Locksmith'),
    ]
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    contact_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=300, blank=True)
    license_number = models.CharField(max_length=100, blank=True)
    insurance_expiry = models.DateField(null=True, blank=True)
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=0)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.category})"


class ApprovedContractor(models.Model):
    """A landlord's approval of a Vendor to work on their property (or all their properties
    if property is left blank). Lets landlords curate who is allowed to service their portfolio,
    separate from the staff-managed Vendor directory itself."""
    landlord = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  related_name='approved_contractors')
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='landlord_approvals')
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, null=True, blank=True,
                                  related_name='approved_contractors',
                                  help_text='Leave blank to approve for all of this landlord\'s properties')
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    approved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['landlord', 'vendor', 'property']
        ordering = ['-approved_at']

    def __str__(self):
        scope = self.property.name if self.property else 'all properties'
        return f"{self.landlord} approved {self.vendor.name} for {scope}"


class WorkOrder(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('emergency', 'Emergency'),
    ]
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('assigned', 'Assigned'),
        ('in_progress', 'In Progress'),
        ('pending_parts', 'Pending Parts'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    CATEGORY_CHOICES = [
        ('plumbing', 'Plumbing'),
        ('electrical', 'Electrical'),
        ('hvac', 'HVAC'),
        ('appliance', 'Appliance'),
        ('structural', 'Structural'),
        ('pest', 'Pest Control'),
        ('cleaning', 'Cleaning'),
        ('landscaping', 'Landscaping'),
        ('other', 'Other'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='work_orders')
    unit = models.ForeignKey('properties.Unit', on_delete=models.CASCADE,
                              related_name='work_orders', null=True, blank=True)
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name='reported_work_orders')
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='assigned_work_orders')
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='work_orders')
    title = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    scheduled_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    image = models.ImageField(upload_to='work_orders/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"WO#{self.pk} - {self.title} [{self.priority}]"


class MaintenanceExpense(models.Model):
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='expenses')
    description = models.CharField(max_length=300)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    expense_date = models.DateField()
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True)
    receipt = models.FileField(upload_to='receipts/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Expense ${self.amount} for WO#{self.work_order.pk}"
