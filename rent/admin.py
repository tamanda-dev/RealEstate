from django.contrib import admin
from .models import Invoice, Payment, LateFeeRule


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'tenant', 'total_amount', 'paid_amount', 'status', 'due_date']
    list_filter = ['status']
    search_fields = ['invoice_number', 'tenant__first_name', 'tenant__last_name']
    inlines = [PaymentInline]


admin.site.register(Payment)
admin.site.register(LateFeeRule)
