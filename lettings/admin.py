from django.contrib import admin
from .models import PropertyInspection, LandlordDisbursement


@admin.register(PropertyInspection)
class PropertyInspectionAdmin(admin.ModelAdmin):
    list_display = ['property', 'inspection_type', 'scheduled_date', 'status', 'overall_condition', 'action_required']
    list_filter = ['inspection_type', 'status', 'action_required', 'overall_condition']
    search_fields = ['property__name']
    date_hierarchy = 'scheduled_date'


@admin.register(LandlordDisbursement)
class LandlordDisbursementAdmin(admin.ModelAdmin):
    list_display = ['property', 'owner', 'period_month', 'period_year', 'gross_rent_usd',
                    'agent_commission_usd', 'net_to_landlord_usd', 'status']
    list_filter = ['status', 'period_year']
    search_fields = ['property__name', 'owner__first_name', 'owner__last_name']
