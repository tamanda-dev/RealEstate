from rest_framework import serializers
from .models import Invoice, Payment, Refund, LateFeeRule, RecurringInvoiceProfile


class PaymentSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    tenant_name = serializers.SerializerMethodField()
    reversed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['status', 'reversed_by', 'reversed_at', 'reversal_reason', 'created_at']

    def get_tenant_name(self, obj):
        return obj.invoice.tenant.get_full_name() if obj.invoice and obj.invoice.tenant else ''

    def get_reversed_by_name(self, obj):
        return obj.reversed_by.get_full_name() if obj.reversed_by else ''


class RefundSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    invoice_number = serializers.CharField(source='payment.invoice.invoice_number', read_only=True)
    tenant_name = serializers.SerializerMethodField()

    class Meta:
        model = Refund
        fields = '__all__'
        read_only_fields = ['status', 'requested_by', 'requested_at', 'approved_by', 'approved_at',
                             'processed_at', 'rejection_reason']

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else ''

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else ''

    def get_tenant_name(self, obj):
        return obj.payment.invoice.tenant.get_full_name() if obj.payment and obj.payment.invoice else ''

    def validate(self, data):
        payment = data.get('payment') or (self.instance.payment if self.instance else None)
        amount = data.get('amount')
        if payment and amount is not None:
            already_committed = sum(
                (r.amount for r in payment.refunds.exclude(status='rejected')
                 .exclude(pk=self.instance.pk if self.instance else None)), 0)
            if already_committed + amount > payment.amount:
                raise serializers.ValidationError(
                    {'amount': f'Refund amount exceeds what remains refundable on this payment '
                                f'(${payment.amount - already_committed} available).'})
        return data


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
