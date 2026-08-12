from django.conf import settings
from django.db import models


class CompanySettings(models.Model):
    """Branding/identity for whichever real estate company is running this deployment —
    a singleton (like whatsapp_integration.WhatsAppConfig), edited once from an admin
    Settings screen and read by report headers everywhere else in the app."""
    company_name = models.CharField(max_length=200, blank=True)
    logo = models.ImageField(upload_to='company/', blank=True, null=True)
    address = models.CharField(max_length=300, blank=True)
    city = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    website = models.CharField(max_length=200, blank=True)
    registration_number = models.CharField(max_length=100, blank=True,
                                            help_text='Company registration number')
    tax_number = models.CharField(max_length=100, blank=True, help_text='VAT / tax number')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name='company_settings_updates')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Company Settings'
        verbose_name_plural = 'Company Settings'

    def __str__(self):
        return self.company_name or 'Company Settings'

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
