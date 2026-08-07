from django.db import models
from django.conf import settings


class PipelineStage(models.Model):
    DEAL_TYPE_CHOICES = [('sale', 'Sale'), ('lease', 'Lease'), ('all', 'All')]
    name = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)
    deal_type = models.CharField(max_length=10, choices=DEAL_TYPE_CHOICES, default='all')
    color = models.CharField(max_length=20, default='#3b82f6')
    description = models.CharField(max_length=300, blank=True)
    is_won = models.BooleanField(default=False)
    is_lost = models.BooleanField(default=False)

    class Meta:
        ordering = ['deal_type', 'order']

    def __str__(self):
        return f"{self.name} ({self.deal_type})"


class Lead(models.Model):
    SOURCE_CHOICES = [
        ('whatsapp', 'WhatsApp'), ('website', 'Website'), ('referral', 'Referral'),
        ('herald', 'Herald / Newspaper'), ('social', 'Social Media'),
        ('walk_in', 'Walk-In'), ('phone', 'Phone Call'),
        ('classifieds', 'Classifieds ZW'), ('signage', 'Property Signage'), ('other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('new', 'New'), ('contacted', 'Contacted'), ('qualified', 'Qualified'),
        ('site_visit', 'Site Visit'), ('negotiating', 'Negotiating'), ('won', 'Won'), ('lost', 'Lost'),
    ]
    DEAL_TYPE_CHOICES = [('sale', 'Purchase'), ('lease', 'Rental'), ('both', 'Purchase or Rental')]

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30)
    whatsapp_number = models.CharField(max_length=30, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='whatsapp')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    deal_type = models.CharField(max_length=10, choices=DEAL_TYPE_CHOICES, default='sale')
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='assigned_leads')
    contact = models.ForeignKey('sales.Contact', on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='source_leads',
                                 help_text='Set once this lead is converted into (or matched against) a '
                                           'sales Contact, so the same person is never re-typed from '
                                           'scratch — multiple leads (e.g. repeat inquiries) can point '
                                           'at the same contact')
    property_interest = models.ManyToManyField('properties.Property', blank=True,
                                                related_name='interested_leads')
    preferred_location = models.CharField(max_length=200, blank=True)
    budget_min_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    budget_max_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    bedrooms_wanted = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    lost_reason = models.CharField(max_length=300, blank=True)
    next_followup = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def __str__(self):
        return f"{self.full_name} ({self.status})"


class Opportunity(models.Model):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='opportunities')
    stage = models.ForeignKey(PipelineStage, on_delete=models.SET_NULL, null=True)
    property = models.ForeignKey('properties.Property', on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name='opportunities')
    deal_type = models.CharField(max_length=10, choices=[('sale', 'Sale'), ('lease', 'Lease')], default='sale')
    expected_value_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    probability = models.PositiveIntegerField(default=20)
    expected_close_date = models.DateField(null=True, blank=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='opportunities')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Opp: {self.lead.full_name} → {self.stage}"


class Interaction(models.Model):
    TYPE_CHOICES = [
        ('call', 'Phone Call'), ('whatsapp', 'WhatsApp'), ('email', 'Email'),
        ('sms', 'SMS'), ('site_visit', 'Site Visit'), ('meeting', 'Office Meeting'), ('note', 'Note'),
    ]
    DIRECTION_CHOICES = [('inbound', 'Inbound'), ('outbound', 'Outbound')]
    OUTCOME_CHOICES = [
        ('interested', 'Interested'), ('followup', 'Follow-up Needed'),
        ('not_interested', 'Not Interested'), ('deal_progressed', 'Deal Progressed'),
        ('no_answer', 'No Answer'), ('other', 'Other'),
    ]

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, null=True, blank=True, related_name='interactions')
    contact = models.ForeignKey('sales.Contact', on_delete=models.CASCADE, null=True, blank=True, related_name='interactions')
    interaction_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='call')
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default='outbound')
    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='interactions')
    property = models.ForeignKey('properties.Property', on_delete=models.SET_NULL, null=True, blank=True, related_name='interactions')
    summary = models.TextField()
    outcome = models.CharField(max_length=20, choices=OUTCOME_CHOICES, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    next_followup_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        subject = self.lead or self.contact
        return f"[{self.interaction_type}] {subject}"


class Campaign(models.Model):
    TYPE_CHOICES = [('whatsapp', 'WhatsApp Blast'), ('email', 'Email'), ('sms', 'SMS')]
    STATUS_CHOICES = [('draft', 'Draft'), ('scheduled', 'Scheduled'), ('running', 'Running'), ('completed', 'Completed')]

    name = models.CharField(max_length=200)
    campaign_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='whatsapp')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    message_body = models.TextField()
    target_statuses = models.JSONField(default=list)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.campaign_type})"
