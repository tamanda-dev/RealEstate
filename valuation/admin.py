from django.contrib import admin
from .models import Valuation, Comparable, PriceTrend


admin.site.register(Valuation)
admin.site.register(Comparable)
admin.site.register(PriceTrend)
