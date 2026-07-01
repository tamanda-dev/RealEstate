from django.db import models
from django.conf import settings
from decimal import Decimal


class Listing(models.Model):
    TYPE_CHOICES = [('sale', 'For Sale'), ('rent', 'For Rent'), ('both', 'Sale or Rent')]
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('pending', 'Pending'),
        ('sold', 'Sold'),
        ('withdrawn', 'Withdrawn'),
        ('expired', 'Expired'),
    ]

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE,
                                  related_name='listings')
    listing_agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                      null=True, related_name='listings')
    listing_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='sale')
    asking_price = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    listing_date = models.DateField()
    expiry_date = models.DateField(null=True, blank=True)
    mls_number = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    virtual_tour_url = models.URLField(blank=True)
    open_house_date = models.DateTimeField(null=True, blank=True)
    days_on_market = models.PositiveIntegerField(default=0)
    views_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        import datetime
        if self.listing_date:
            self.days_on_market = (datetime.date.today() - self.listing_date).days
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.property.name} - {self.listing_type} ${self.asking_price}"


class Contact(models.Model):
    TYPE_CHOICES = [('buyer', 'Buyer'), ('seller', 'Seller'), ('both', 'Buyer & Seller')]
    STATUS_CHOICES = [
        ('lead', 'Lead'),
        ('prospect', 'Prospect'),
        ('active', 'Active Client'),
        ('closed', 'Closed'),
        ('inactive', 'Inactive'),
    ]

    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                              null=True, related_name='contacts')
    contact_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='lead')
    budget_min = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    budget_max = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    preferred_areas = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    source = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.full_name} ({self.contact_type})"


class Offer(models.Model):
    STATUS_CHOICES = [
        ('submitted', 'Submitted'),
        ('countered', 'Countered'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('withdrawn', 'Withdrawn'),
        ('expired', 'Expired'),
    ]

    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='offers')
    buyer = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='offers')
    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                              null=True, related_name='offers')
    offer_amount = models.DecimalField(max_digits=14, decimal_places=2)
    earnest_money = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))
    financing_contingency = models.BooleanField(default=True)
    inspection_contingency = models.BooleanField(default=True)
    appraisal_contingency = models.BooleanField(default=True)
    closing_date = models.DateField()
    expiry_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='submitted')
    notes = models.TextField(blank=True)
    counter_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Offer ${self.offer_amount} on {self.listing}"


class CommissionStructure(models.Model):
    name = models.CharField(max_length=100)
    total_rate = models.DecimalField(max_digits=5, decimal_places=2, help_text='Total % commission')
    listing_agent_split = models.DecimalField(max_digits=5, decimal_places=2,
                                               help_text='% split to listing agent')
    buyer_agent_split = models.DecimalField(max_digits=5, decimal_places=2,
                                             help_text='% split to buyer agent')
    broker_fee = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    is_default = models.BooleanField(default=False)

    def calculate(self, sale_price):
        from decimal import Decimal
        sp = Decimal(str(sale_price))
        total = sp * self.total_rate / 100
        listing = total * self.listing_agent_split / 100
        buyer = total * self.buyer_agent_split / 100
        broker = total * self.broker_fee / 100
        return {'total': total, 'listing_agent': listing, 'buyer_agent': buyer, 'broker': broker}

    def __str__(self):
        return f"{self.name} ({self.total_rate}%)"


class Transaction(models.Model):
    listing = models.OneToOneField(Listing, on_delete=models.CASCADE, related_name='transaction')
    accepted_offer = models.OneToOneField(Offer, on_delete=models.SET_NULL, null=True)
    commission_structure = models.ForeignKey(CommissionStructure, on_delete=models.SET_NULL,
                                              null=True, blank=True)
    sale_price = models.DecimalField(max_digits=14, decimal_places=2)
    closing_date = models.DateField()
    total_commission = models.DecimalField(max_digits=14, decimal_places=2)
    listing_agent_commission = models.DecimalField(max_digits=14, decimal_places=2)
    buyer_agent_commission = models.DecimalField(max_digits=14, decimal_places=2)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Transaction: {self.listing} @ ${self.sale_price}"
