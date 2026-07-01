from django.contrib import admin
from .models import Lease, LeaseClause, LeaseRenewal


@admin.register(Lease)
class LeaseAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'property', 'start_date', 'end_date', 'monthly_rent', 'status']
    list_filter = ['status']
    search_fields = ['tenant__first_name', 'property__name']


admin.site.register(LeaseClause)
admin.site.register(LeaseRenewal)
