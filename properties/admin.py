from django.contrib import admin
from .models import Property, PropertyImage, Unit


class PropertyImageInline(admin.TabularInline):
    model = PropertyImage
    extra = 1


class UnitInline(admin.TabularInline):
    model = Unit
    extra = 1


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ['name', 'property_type', 'status', 'city', 'state', 'monthly_rent', 'current_value']
    list_filter = ['property_type', 'status', 'city']
    search_fields = ['name', 'address', 'city']
    inlines = [PropertyImageInline, UnitInline]


admin.site.register(PropertyImage)
admin.site.register(Unit)
