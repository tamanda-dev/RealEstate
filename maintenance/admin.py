from django.contrib import admin
from .models import Vendor, WorkOrder, MaintenanceExpense


@admin.register(WorkOrder)
class WorkOrderAdmin(admin.ModelAdmin):
    list_display = ['title', 'property', 'priority', 'status', 'vendor', 'created_at']
    list_filter = ['status', 'priority', 'category']
    search_fields = ['title', 'description']


admin.site.register(Vendor)
admin.site.register(MaintenanceExpense)
