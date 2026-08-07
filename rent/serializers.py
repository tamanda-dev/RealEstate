from rest_framework import serializers
from .models import Invoice, Payment, LateFeeRule, RecurringInvoiceProfile


class PaymentSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    tenant_name = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['created_at']

    def get_tenant_name(self, obj):
        return obj.invoice.tenant.get_full_name() if obj.invoice and obj.invoice.tenant else ''


class InvoiceSerializer(serializers.ModelSerializer):
    payments = PaymentSerializer(many=True, read_only=True)
    tenant_name = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = '__all__'
        read_only_fields = ['invoice_number', 'total_amount', 'total_amount_zig',
                             'recurring_profile', 'created_at', 'updated_at']

    def get_tenant_name(self, obj):
        return obj.tenant.get_full_name() if obj.tenant else ''

    def get_property_name(self, obj):
        return obj.property.name if obj.property else ''

    def get_balance_due(self, obj):
        return float(obj.total_amount - obj.paid_amount)


class LateFeeRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = LateFeeRule
        fields = '__all__'


class RecurringInvoiceProfileSerializer(serializers.ModelSerializer):
    tenant_name = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    monthly_rent = serializers.DecimalField(source='lease.monthly_rent', max_digits=10,
                                             decimal_places=2, read_only=True)

    class Meta:
        model = RecurringInvoiceProfile
        fields = '__all__'

    def get_tenant_name(self, obj):
        return obj.lease.tenant.get_full_name() if obj.lease and obj.lease.tenant else ''

    def get_property_name(self, obj):
        return obj.lease.property.name if obj.lease and obj.lease.property else ''
