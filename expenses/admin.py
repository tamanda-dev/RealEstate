from django.contrib import admin
from .models import ExpenseCategory, OperatingExpense, ExpenseBudget


@admin.register(OperatingExpense)
class OperatingExpenseAdmin(admin.ModelAdmin):
    list_display = ['description', 'property', 'category', 'amount', 'expense_date',
                    'status', 'vendor_name']
    list_filter = ['status', 'category', 'is_recurring']
    search_fields = ['description', 'vendor_name', 'reference_number']
    date_hierarchy = 'expense_date'


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'category_type', 'is_tax_deductible', 'is_active']
    list_filter = ['category_type', 'is_tax_deductible', 'is_active']


admin.site.register(ExpenseBudget)
