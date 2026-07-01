from django.db import models
from django.conf import settings
import os


class PropertyDocument(models.Model):
    TYPE_CHOICES = [
        ('deed', 'Title Deed'), ('blueprint', 'Blueprint / Site Plan'),
        ('floor_plan', 'Floor Plan'), ('valuation', 'Valuation Report'),
        ('insurance', 'Insurance Certificate'), ('rates_clearance', 'Rates Clearance'),
        ('inspection', 'Inspection Report'), ('fire_cert', 'Fire Safety Certificate'),
        ('lease_doc', 'Signed Lease'), ('sale_agreement', 'Offer to Purchase'),
        ('photo', 'Property Photo'), ('virtual_tour', 'Virtual Tour / Video'),
        ('brochure', 'Marketing Brochure'), ('ecd', 'Environmental Compliance'),
        ('other', 'Other'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='property_documents')
    unit = models.ForeignKey('properties.Unit', on_delete=models.SET_NULL, null=True, blank=True, related_name='unit_documents')
    title = models.CharField(max_length=200)
    document_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default='other')
    file = models.FileField(upload_to='property_documents/')
    is_confidential = models.BooleanField(default=False)
    is_public = models.BooleanField(default=False)
    file_size_kb = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, related_name='uploaded_documents')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['property', 'document_type', '-created_at']

    def filename(self):
        return os.path.basename(self.file.name) if self.file else ''

    def __str__(self):
        return f"{self.title} ({self.document_type}) — {self.property.name}"
