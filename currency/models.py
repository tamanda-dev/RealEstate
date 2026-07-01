from django.db import models
from django.conf import settings
from decimal import Decimal


class ExchangeRate(models.Model):
    SOURCE_CHOICES = [
        ('rbz', 'RBZ Official Rate'),
        ('interbank', 'Interbank Rate'),
        ('parallel', 'Parallel Market Rate'),
        ('manual', 'Manual Entry'),
    ]

    date = models.DateField()
    usd_to_zig = models.DecimalField(max_digits=14, decimal_places=4,
                                      help_text='How many ZiG per 1 USD')
    source = models.CharField(max_length=15, choices=SOURCE_CHOICES, default='rbz')
    set_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                               null=True, related_name='exchange_rates')
    notes = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    @property
    def zig_to_usd(self):
        if self.usd_to_zig and self.usd_to_zig > 0:
            return round(Decimal('1') / self.usd_to_zig, 6)
        return Decimal('0')

    def convert_usd_to_zig(self, usd_amount):
        return round(Decimal(str(usd_amount)) * self.usd_to_zig, 2)

    def convert_zig_to_usd(self, zig_amount):
        if self.usd_to_zig and self.usd_to_zig > 0:
            return round(Decimal(str(zig_amount)) / self.usd_to_zig, 2)
        return Decimal('0')

    def __str__(self):
        return f"USD/ZiG {self.usd_to_zig} — {self.date} ({self.source})"

    @classmethod
    def get_latest(cls):
        return cls.objects.filter(is_active=True).order_by('-date', '-created_at').first()
