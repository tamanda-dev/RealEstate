from rest_framework import serializers
from .models import ExpenseCategory, OperatingExpense, ExpenseBudget


class ExpenseCategorySerializer(serializers.ModelSerializer):
    category_type_display = serializers.CharField(
        source='get_category_type_display', read_only=True)

    class Meta:
        model = ExpenseCategory
        fields = '__all__'


class OperatingExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_type = serializers.CharField(source='category.category_type', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    unit_number = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    recurrence_display = serializers.CharField(source='get_recurrence_display', read_only=True)

    class Meta:
        model = OperatingExpense
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def get_unit_number(self, obj):
        return obj.unit.unit_number if obj.unit else None


class ExpenseBudgetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    actual_amount = serializers.SerializerMethodField()
    variance = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseBudget
        fields = '__all__'

    def get_actual_amount(self, obj):
        qs = OperatingExpense.objects.filter(
            property=obj.property,
            category=obj.category,
            expense_date__year=obj.year,
            status__in=['pending', 'paid'],
        )
        if obj.month:
            qs = qs.filter(expense_date__month=obj.month)
        from django.db.models import Sum
        result = qs.aggregate(t=Sum('amount'))['t']
        return float(result or 0)

    def get_variance(self, obj):
        actual = self.get_actual_amount(obj)
        return float(obj.budgeted_amount) - actual
