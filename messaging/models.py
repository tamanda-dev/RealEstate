from django.conf import settings
from django.db import models


class EmailTemplate(models.Model):
    """Reusable email content — {{name}}/{{email}}/{{due_date}} get substituted per-recipient
    on bulk send, the same convention WhatsAppTemplate uses, so authoring a template feels
    familiar. {{due_date}} is the recipient's nearest outstanding rent invoice due date
    (blank if they have none)."""
    name = models.CharField(max_length=100, unique=True)
    subject = models.CharField(max_length=300)
    body = models.TextField(help_text='Use {{name}}, {{email}} or {{due_date}} for per-recipient values')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def render(self, variables):
        subject, body = self.subject, self.body
        for key, val in (variables or {}).items():
            subject = subject.replace(f'{{{{{key}}}}}', str(val))
            body = body.replace(f'{{{{{key}}}}}', str(val))
        return subject, body

    def __str__(self):
        return self.name


class EmailMessage(models.Model):
    STATUS_CHOICES = [('sent', 'Sent'), ('failed', 'Failed')]

    to_email = models.EmailField()
    to_name = models.CharField(max_length=200, blank=True)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='received_emails',
                                   help_text='Set when the recipient was picked from registered users')
    subject = models.CharField(max_length=300)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='sent')
    error_message = models.CharField(max_length=500, blank=True)
    lead = models.ForeignKey('crm.Lead', on_delete=models.SET_NULL, null=True, blank=True, related_name='emails')
    contact = models.ForeignKey('sales.Contact', on_delete=models.SET_NULL, null=True, blank=True, related_name='emails')
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='sent_emails')
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f"{self.to_email} — {self.subject} ({self.status})"


class SMSMessage(models.Model):
    STATUS_CHOICES = [('sent', 'Sent'), ('failed', 'Failed'), ('simulated', 'Simulated')]

    to_phone = models.CharField(max_length=30)
    to_name = models.CharField(max_length=200, blank=True)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='received_sms',
                                   help_text='Set when the recipient was picked from registered users')
    body = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='sent')
    twilio_sid = models.CharField(max_length=100, blank=True)
    error_message = models.CharField(max_length=500, blank=True)
    lead = models.ForeignKey('crm.Lead', on_delete=models.SET_NULL, null=True, blank=True, related_name='sms_messages')
    contact = models.ForeignKey('sales.Contact', on_delete=models.SET_NULL, null=True, blank=True, related_name='sms_messages')
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='sent_sms')
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f"{self.to_phone} — {self.status}"
