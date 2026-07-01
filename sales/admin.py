from django.contrib import admin
from .models import Listing, Contact, Offer, CommissionStructure, Transaction


admin.site.register(Listing)
admin.site.register(Contact)
admin.site.register(Offer)
admin.site.register(CommissionStructure)
admin.site.register(Transaction)
