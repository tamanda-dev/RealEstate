from django.db import models
from django.conf import settings


class WhatsAppConfig(models.Model):
    phone_number_id = models.CharField(max_length=100, blank=True)
    access_token = models.TextField(blank=True)
    webhook_verify_token = models.CharField(max_length=200, blank=True)
    business_account_id = models.CharField(max_length=100, blank=True)
    display_phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=False)
    simulate_mode = models.BooleanField(default=True,
                                         help_text='Log messages without calling Meta API')
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name='whatsapp_config_updates')

    class Meta:
        verbose_name = 'WhatsApp Configuration'

    def __str__(self):
        return f"WhatsApp Config ({'active' if self.is_active else 'inactive'})"

    @classmethod
    def get_config(cls):
        obj, _ = cls.objects.get_or_create(pk=1, defaults={'simulate_mode': True})
        return obj


class WhatsAppTemplate(models.Model):
    USAGE_CHOICES = [
        ('quote', 'Property Quote'), ('invoice', 'Rent Invoice'),
        ('payment_receipt', 'Payment Receipt'), ('lease_expiry', 'Lease Expiry Alert'),
        ('maintenance', 'Maintenance Update'), ('brochure', 'Property Brochure'),
        ('lead_response', 'Lead Auto-Response'), ('overdue', 'Overdue Warning'),
        ('reservation', 'Reservation Confirmation'), ('welcome', 'Welcome'),
        ('custom', 'Custom'),
    ]
    LANGUAGE_CHOICES = [('en', 'English'), ('sn', 'Shona'), ('nd', 'Ndebele')]

    name = models.CharField(max_length=100, unique=True)
    usage_type = models.CharField(max_length=20, choices=USAGE_CHOICES, default='custom')
    language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default='en')
    body_text = models.TextField(
        help_text='Use {{1}}, {{2}} for variables. E.g. "Dear {{1}}, your rent of ${{2}} is due {{3}}."')
    variable_labels = models.JSONField(default=list)
    footer_text = models.CharField(max_length=200, blank=True)
    is_approved = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.usage_type})"

    def render(self, variables: list) -> str:
        text = self.body_text
        for i, val in enumerate(variables, 1):
            text = text.replace(f'{{{{{i}}}}}', str(val))
        return text


class WhatsAppMessage(models.Model):
    DIRECTION_CHOICES = [('inbound', 'Inbound'), ('outbound', 'Outbound')]
    STATUS_CHOICES = [
        ('pending', 'Pending'), ('sent', 'Sent'), ('delivered', 'Delivered'),
        ('read', 'Read'), ('failed', 'Failed'), ('simulated', 'Simulated'),
    ]

    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default='outbound')
    contact_phone = models.CharField(max_length=30)
    contact_name = models.CharField(max_length=200, blank=True)
    template = models.ForeignKey(WhatsAppTemplate, on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name='messages')
    message_text = models.TextField()
    message_id = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    error_message = models.CharField(max_length=500, blank=True)
    lead = models.ForeignKey('crm.Lead', on_delete=models.SET_NULL, null=True, blank=True, related_name='whatsapp_messages')
    contact = models.ForeignKey('sales.Contact', on_delete=models.SET_NULL, null=True, blank=True, related_name='whatsapp_messages')
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='sent_whatsapp')
    sent_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f"[{self.direction}] {self.contact_phone} — {self.status}"
