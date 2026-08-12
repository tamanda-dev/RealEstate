import datetime
import secrets

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    ROLE_CHOICES = [
        # Internal staff
        ('admin',               'System Administrator'),
        ('sales_manager',       'Sales Manager'),
        ('property_manager',    'Property Manager'),
        ('valuation_manager',   'Valuation & Appraisal Manager'),
        ('accountant',          'Accountant / Finance Officer'),
        ('agent',               'Real Estate Agent / Realtor'),
        # External parties
        ('landlord',            'Seller / Landlord'),
        ('tenant',              'Tenant / Renter'),
        ('buyer',               'Buyer / Prospective Renter'),
        # Legacy aliases (preserved for existing data)
        ('manager',             'General Manager'),
        ('owner',               'Property Owner'),
    ]

    # Convenience groupings used by permission logic across the app
    INTERNAL_STAFF = {'admin', 'sales_manager', 'property_manager',
                      'valuation_manager', 'accountant', 'agent', 'manager'}
    MANAGERS = {'admin', 'sales_manager', 'property_manager', 'manager'}
    ADMIN_ROLES = {'admin'}

    role = models.CharField(max_length=25, choices=ROLE_CHOICES, default='agent')
    phone = models.CharField(max_length=30, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    # Buyer-specific preferences
    preferred_areas = models.CharField(max_length=300, blank=True)
    budget_min_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    budget_max_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_joined']

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    # ── Role helpers ───────────────────────────────────────────────────────────

    @property
    def is_internal_staff(self):
        return self.role in self.INTERNAL_STAFF

    @property
    def is_admin_or_manager(self):
        return self.role in self.MANAGERS

    @property
    def is_buyer(self):
        return self.role == 'buyer'

    @property
    def is_tenant(self):
        return self.role == 'tenant'

    @property
    def is_landlord(self):
        return self.role in ('landlord', 'owner')

    @property
    def is_agent(self):
        return self.role == 'agent'

    @property
    def is_sales_manager(self):
        return self.role in ('sales_manager', 'admin')

    @property
    def is_valuation_manager(self):
        return self.role in ('valuation_manager', 'admin')

    @property
    def is_accountant(self):
        return self.role in ('accountant', 'admin')


class PasswordResetOTP(models.Model):
    """A 6-digit code texted to a user's phone for the SMS branch of forgot-password —
    the email branch uses Django's built-in uid/token link instead (see users/views.py).
    Codes are single-use and short-lived; a fresh request invalidates any prior unused code
    for the same user so only the most recently sent code is ever valid."""
    OTP_TTL_MINUTES = 10
    MAX_ATTEMPTS = 5

    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='password_reset_otps')
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"OTP for {self.user.username} ({'used' if self.is_used else 'active'})"

    @classmethod
    def generate_for(cls, user):
        cls.objects.filter(user=user, is_used=False).update(is_used=True)
        code = f"{secrets.randbelow(10 ** 6):06d}"  # cryptographically secure, not random.randint
        return cls.objects.create(
            user=user, code=code,
            expires_at=timezone.now() + datetime.timedelta(minutes=cls.OTP_TTL_MINUTES),
        )

    def is_valid(self):
        return not self.is_used and self.attempts < self.MAX_ATTEMPTS and self.expires_at > timezone.now()
