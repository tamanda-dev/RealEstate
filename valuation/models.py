from django.db import models
from django.conf import settings
from decimal import Decimal


class SalesComparablesDB(models.Model):
    """Standalone verified sales database — the core comparables registry."""
    PROPERTY_TYPE_CHOICES = [
        ('residential', 'Residential'), ('commercial', 'Commercial'),
        ('industrial', 'Industrial'), ('land', 'Land / Stand'),
        ('agricultural', 'Agricultural'), ('mixed', 'Mixed Use'),
    ]
    TENURE_CHOICES = [
        ('freehold', 'Freehold'), ('leasehold', 'Leasehold'),
        ('state_land', 'State Land (99yr)'), ('sectional_title', 'Sectional Title'), ('other', 'Other'),
    ]
    CONDITION_CHOICES = [
        ('excellent', 'Excellent'), ('good', 'Good'), ('fair', 'Fair'), ('poor', 'Poor'),
    ]
    SOURCE_CHOICES = [
        ('deeds_registry', 'Deeds Registry'), ('agent_confirmed', 'Agent Confirmed'),
        ('newspaper', 'Herald / NewsDay'), ('own_sale', 'In-House Sale'),
        ('other_valuer', 'Other Valuer'), ('other', 'Other'),
    ]

    # Location
    address = models.CharField(max_length=300)
    suburb = models.CharField(max_length=100)
    city = models.CharField(max_length=100)

    # Property details
    property_type = models.CharField(max_length=20, choices=PROPERTY_TYPE_CHOICES)
    tenure = models.CharField(max_length=20, choices=TENURE_CHOICES, default='freehold')
    land_size_sqm = models.DecimalField(max_digits=12, decimal_places=2,
                                         help_text='Stand/land size in square metres')
    floor_area_sqm = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'),
                                          help_text='Gross floor area / improvements in sqm')
    bedrooms = models.PositiveIntegerField(default=0)
    bathrooms = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    garages = models.PositiveIntegerField(default=0)
    condition = models.CharField(max_length=15, choices=CONDITION_CHOICES, default='good')

    # Sale details
    sale_price_usd = models.DecimalField(max_digits=14, decimal_places=2)
    sale_date = models.DateField()
    days_on_market = models.PositiveIntegerField(null=True, blank=True)

    # Computed rates (auto on save)
    price_per_sqm_land_usd = models.DecimalField(max_digits=10, decimal_places=2,
                                                   null=True, blank=True)
    price_per_sqm_floor_usd = models.DecimalField(max_digits=10, decimal_places=2,
                                                    null=True, blank=True)

    # Data quality
    verified = models.BooleanField(default=False)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='agent_confirmed')
    notes = models.TextField(blank=True)

    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                  null=True, related_name='sales_comparables')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-sale_date']
        verbose_name = 'Sales Comparable'
        verbose_name_plural = 'Sales Comparables Database'

    def save(self, *args, **kwargs):
        if self.land_size_sqm and self.land_size_sqm > 0:
            self.price_per_sqm_land_usd = round(self.sale_price_usd / self.land_size_sqm, 2)
        if self.floor_area_sqm and self.floor_area_sqm > 0:
            self.price_per_sqm_floor_usd = round(self.sale_price_usd / self.floor_area_sqm, 2)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.address}, {self.suburb} — ${self.sale_price_usd:,.0f} ({self.sale_date})"


class ValuationMethodology(models.Model):
    """Stores the working for each valuation approach applied."""
    METHOD_CHOICES = [
        ('comparable_sales', 'Comparable Sales Method'),
        ('investment', 'Investment Approach (Income Capitalisation)'),
        ('cost', 'Cost Approach (Depreciated Replacement Cost)'),
    ]

    valuation = models.ForeignKey('Valuation', on_delete=models.CASCADE, related_name='methodologies')
    method = models.CharField(max_length=25, choices=METHOD_CHOICES)
    calculated_value_usd = models.DecimalField(max_digits=14, decimal_places=2)
    weight_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('100'),
                                      help_text='Weight assigned to this method in final value')
    inputs = models.JSONField(default=dict, help_text='Method-specific inputs stored as JSON')
    working_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.method} — ${self.calculated_value_usd} for {self.valuation}"


class Valuation(models.Model):
    METHOD_CHOICES = [
        ('avm', 'Automated Valuation Model'),
        ('cma', 'Comparable Sales Method'),
        ('investment', 'Investment Approach'),
        ('cost', 'Cost Approach'),
        ('appraisal', 'Full Professional Appraisal'),
        ('broker_opinion', 'Broker Price Opinion'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='valuations')
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, related_name='valuations')
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='avm')
    estimated_value = models.DecimalField(max_digits=14, decimal_places=2)
    low_estimate = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    high_estimate = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    confidence_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True,
                                           help_text='0-100 confidence percentage')
    valuation_date = models.DateField()
    notes = models.TextField(blank=True)
    report = models.FileField(upload_to='valuations/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-valuation_date']

    def __str__(self):
        return f"{self.property.name} - ${self.estimated_value} ({self.method})"


class Comparable(models.Model):
    valuation = models.ForeignKey(Valuation, on_delete=models.CASCADE, related_name='comparables')
    address = models.CharField(max_length=300)
    sale_price = models.DecimalField(max_digits=14, decimal_places=2)
    sale_date = models.DateField()
    square_feet = models.DecimalField(max_digits=10, decimal_places=2)
    bedrooms = models.PositiveIntegerField()
    bathrooms = models.DecimalField(max_digits=4, decimal_places=1)
    price_per_sqft = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    distance_miles = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    adjustments = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                       help_text='Positive/negative price adjustments')
    notes = models.CharField(max_length=500, blank=True)

    def save(self, *args, **kwargs):
        if self.square_feet and self.square_feet > 0:
            self.price_per_sqft = self.sale_price / self.square_feet
        else:
            self.price_per_sqft = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Comp: {self.address} ${self.sale_price}"


class PriceTrend(models.Model):
    area = models.CharField(max_length=200)
    period_start = models.DateField()
    period_end = models.DateField()
    avg_price = models.DecimalField(max_digits=14, decimal_places=2)
    median_price = models.DecimalField(max_digits=14, decimal_places=2)
    avg_price_per_sqft = models.DecimalField(max_digits=10, decimal_places=2)
    total_sales = models.PositiveIntegerField()
    avg_days_on_market = models.PositiveIntegerField()
    price_change_pct = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True,
                                            help_text='% change from prior period')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['area', '-period_start']

    def __str__(self):
        return f"{self.area} - {self.period_start} avg ${self.avg_price}"
