from django.db import models
from django.conf import settings


class Notification(models.Model):
    TYPE_CHOICES = [
        ('lease_expiring', 'Lease Expiring'),
        ('lease_expired', 'Lease Expired'),
        ('rent_overdue', 'Rent Overdue'),
        ('payment_received', 'Payment Received'),
        ('work_order_update', 'Work Order Update'),
        ('maintenance_complete', 'Maintenance Complete'),
        ('maintenance_assigned', 'Maintenance Assigned'),
        ('renewal_proposed', 'Renewal Proposed'),
        ('system', 'System'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='notifications')
    notification_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default='system')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal')
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    link = models.CharField(max_length=200, blank=True, help_text='Frontend route, e.g. /leases')
    related_object_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.notification_type}] {self.title} → {self.user}"

    @classmethod
    def create_for_users(cls, users, notification_type, title, message, link='', priority='normal'):
        """Bulk-create notifications for a list of users."""
        notifications = [
            cls(
                user=user,
                notification_type=notification_type,
                title=title,
                message=message,
                link=link,
                priority=priority,
            )
            for user in users
        ]
        cls.objects.bulk_create(notifications, ignore_conflicts=True)
