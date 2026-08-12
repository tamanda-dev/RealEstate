from django.conf import settings
from django.db import models


class EmailMessage(models.Model):
    STATUS_CHOICES = [('sent', 'Sent'), ('failed', 'Failed')]

    to_email = models.EmailField()
    to_name = models.CharField(max_length=200, blank=True)
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
