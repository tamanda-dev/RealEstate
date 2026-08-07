from django.conf import settings
from django.db import models


class RentStatementLog(models.Model):
    """Audit trail for Rent Statements: every time a tenant statement is generated and
    distributed (in-app notification today; the delivery_method field leaves room for
    email/WhatsApp channels without a schema change)."""
    DELIVERY_CHOICES = [
        ('in_app', 'In-App Notification'),
        ('email', 'Email'),
        ('whatsapp', 'WhatsApp'),
    ]

    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='rent_statement_logs')
    period_start = models.DateField()
    period_end = models.DateField()
    delivery_method = models.CharField(max_length=10, choices=DELIVERY_CHOICES, default='in_app')
    closing_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, related_name='rent_statements_sent')
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f"Statement for {self.tenant} ({self.period_start} to {self.period_end})"
