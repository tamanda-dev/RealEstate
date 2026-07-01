from django.contrib import admin
from .models import SavedListing, ViewingRequest, BuyerOffer, AgentKPI, DiscountApproval


@admin.register(ViewingRequest)
class ViewingRequestAdmin(admin.ModelAdmin):
    list_display = ['buyer', 'listing', 'agent', 'status', 'confirmed_datetime', 'created_at']
    list_filter = ['status']
    search_fields = ['buyer__username', 'listing__property__name']


@admin.register(BuyerOffer)
class BuyerOfferAdmin(admin.ModelAdmin):
    list_display = ['buyer', 'listing', 'offer_amount_usd', 'status', 'created_at']
    list_filter = ['status', 'is_cash_buyer']


@admin.register(AgentKPI)
class AgentKPIAdmin(admin.ModelAdmin):
    list_display = ['agent', 'period_start', 'period_end', 'leads_assigned', 'deals_closed', 'conversion_rate']


@admin.register(DiscountApproval)
class DiscountApprovalAdmin(admin.ModelAdmin):
    list_display = ['listing', 'requested_by', 'discount_pct', 'status', 'approved_by']
    list_filter = ['status']


admin.site.register(SavedListing)
