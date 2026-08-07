from django.db import models
from django.conf import settings
import datetime


class LeaseClause(models.Model):
    CATEGORY_CHOICES = [
        ('payment', 'Payment Terms'),
        ('maintenance', 'Maintenance'),
        ('pets', 'Pet Policy'),
        ('subletting', 'Subletting'),
        ('termination', 'Termination'),
        ('utilities', 'Utilities'),
        ('general', 'General'),
    ]
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='general')
    content = models.TextField()
    is_standard = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} ({self.category})"


class Lease(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('terminated', 'Terminated'),
        ('renewal_pending', 'Renewal Pending'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='leases')
    unit = models.ForeignKey('properties.Unit', on_delete=models.CASCADE,
                              related_name='leases', null=True, blank=True)
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name='leases')
    start_date = models.DateField()
    end_date = models.DateField()
    monthly_rent = models.DecimalField(max_digits=10, decimal_places=2)
    security_deposit = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    clauses = models.ManyToManyField(LeaseClause, blank=True)
    custom_terms = models.TextField(blank=True)
    document = models.FileField(upload_to='leases/', blank=True, null=True)
    signed_by_tenant = models.BooleanField(default=False)
    signed_by_landlord = models.BooleanField(default=False)
    tenant_signed_at = models.DateTimeField(null=True, blank=True)
    landlord_signed_at = models.DateTimeField(null=True, blank=True)
    renewal_reminder_days = models.PositiveIntegerField(default=60)
    auto_renew = models.BooleanField(default=False)
    next_rent_review_date = models.DateField(
        null=True, blank=True,
        help_text='Lease Diary tracks this for rent-review alerts, separate from renewal/expiry')
    rent_review_frequency_months = models.PositiveIntegerField(
        null=True, blank=True, help_text='e.g. 12 for an annual rent review; leave blank for one-off')
    rent_review_reminder_days = models.PositiveIntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def days_until_expiry(self):
        return (self.end_date - datetime.date.today()).days

    def is_expiring_soon(self):
        return 0 < self.days_until_expiry() <= self.renewal_reminder_days

    def days_until_rent_review(self):
        if not self.next_rent_review_date:
            return None
        return (self.next_rent_review_date - datetime.date.today()).days

    def is_rent_review_due_soon(self):
        days = self.days_until_rent_review()
        return days is not None and 0 <= days <= self.rent_review_reminder_days

    def __str__(self):
        return f"Lease: {self.tenant} @ {self.property.name} ({self.start_date} - {self.end_date})"


class RentReviewLog(models.Model):
    """Lease Diary audit trail: every completed rent review, and the automatic scheduling
    of the next one when the lease has a recurring rent_review_frequency_months."""
    lease = models.ForeignKey(Lease, on_delete=models.CASCADE, related_name='rent_reviews')
    review_date = models.DateField()
    old_rent = models.DecimalField(max_digits=10, decimal_places=2)
    new_rent = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, related_name='rent_reviews_conducted')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-review_date']

    def __str__(self):
        return f"Rent review for {self.lease} on {self.review_date}: ${self.old_rent} -> ${self.new_rent}"


class LeaseRenewal(models.Model):
    lease = models.ForeignKey(Lease, on_delete=models.CASCADE, related_name='renewals')
    proposed_start = models.DateField()
    proposed_end = models.DateField()
    proposed_rent = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'), ('accepted', 'Accepted'), ('declined', 'Declined')
    ], default='pending')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Renewal for {self.lease} - {self.status}"
