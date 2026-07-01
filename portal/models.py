from django.db import models
from django.conf import settings


class SavedListing(models.Model):
    """Buyer / renter saves a listing to their favourites."""
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='saved_listings')
    listing = models.ForeignKey('sales.Listing', on_delete=models.CASCADE,
                                related_name='saved_by')
    notes = models.CharField(max_length=300, blank=True)
    saved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['buyer', 'listing']
        ordering = ['-saved_at']

    def __str__(self):
        return f"{self.buyer.username} saved {self.listing}"


class ViewingRequest(models.Model):
    """Buyer requests a property viewing; agent schedules and confirms it."""
    STATUS_CHOICES = [
        ('pending',   'Pending Review'),
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show',   'No Show'),
    ]

    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='viewing_requests')
    listing = models.ForeignKey('sales.Listing', on_delete=models.CASCADE,
                                related_name='viewing_requests')
    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='managed_viewings')
    preferred_dates = models.TextField(blank=True,
                                       help_text='Buyer preferred date/time options')
    confirmed_datetime = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    buyer_notes = models.TextField(blank=True)
    agent_notes = models.TextField(blank=True)
    feedback = models.TextField(blank=True, help_text='Post-viewing feedback from buyer')
    rating = models.PositiveSmallIntegerField(null=True, blank=True,
                                               help_text='Buyer rating 1–5 after viewing')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Viewing: {self.buyer.username} → {self.listing} ({self.status})"


class BuyerOffer(models.Model):
    """Formal offer submitted by a buyer via the portal."""
    STATUS_CHOICES = [
        ('draft',      'Draft'),
        ('submitted',  'Submitted'),
        ('under_review', 'Under Review'),
        ('accepted',   'Accepted'),
        ('rejected',   'Rejected'),
        ('withdrawn',  'Withdrawn'),
    ]

    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='buyer_offers')
    listing = models.ForeignKey('sales.Listing', on_delete=models.CASCADE,
                                related_name='buyer_offers')
    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='handled_offers')
    offer_amount_usd = models.DecimalField(max_digits=14, decimal_places=2)
    is_cash_buyer = models.BooleanField(default=False)
    finance_pre_approved = models.BooleanField(default=False)
    proposed_closing_date = models.DateField(null=True, blank=True)
    conditions = models.TextField(blank=True, help_text='Any conditions attached to the offer')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='draft')
    rejection_reason = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Offer ${self.offer_amount_usd} by {self.buyer.username} on {self.listing}"


class AgentKPI(models.Model):
    """Snapshot of agent performance KPIs — populated by Sales Manager reports."""
    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='kpis')
    period_start = models.DateField()
    period_end = models.DateField()
    leads_assigned = models.PositiveIntegerField(default=0)
    leads_converted = models.PositiveIntegerField(default=0)
    viewings_conducted = models.PositiveIntegerField(default=0)
    offers_submitted = models.PositiveIntegerField(default=0)
    deals_closed = models.PositiveIntegerField(default=0)
    revenue_generated_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    avg_days_to_close = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    conversion_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                           help_text='% of leads converted')
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name='recorded_kpis')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-period_end']
        unique_together = ['agent', 'period_start', 'period_end']

    def __str__(self):
        return f"KPI: {self.agent.username} ({self.period_start} → {self.period_end})"


class DiscountApproval(models.Model):
    """Sales Manager approval workflow for agent discount requests."""
    STATUS_CHOICES = [
        ('pending',  'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    listing = models.ForeignKey('sales.Listing', on_delete=models.CASCADE,
                                related_name='discount_approvals')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                     related_name='discount_requests')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='approved_discounts')
    original_price_usd = models.DecimalField(max_digits=14, decimal_places=2)
    requested_price_usd = models.DecimalField(max_digits=14, decimal_places=2)
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    approval_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Discount request: {self.listing} {self.discount_pct}% ({self.status})"
