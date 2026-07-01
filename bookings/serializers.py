from rest_framework import serializers
from .models import Quotation, Reservation, HandoverChecklist, HandoverItem


class QuotationSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    contact_name = serializers.SerializerMethodField()
    exchange_rate_value = serializers.SerializerMethodField()

    class Meta:
        model = Quotation
        fields = '__all__'
        read_only_fields = ['reference', 'subtotal_usd', 'vat_amount_usd', 'total_usd', 'total_zig', 'created_at', 'updated_at']

    def get_contact_name(self, obj):
        if obj.contact:
            return obj.contact.full_name
        if obj.lead:
            return obj.lead.full_name
        return ''

    def get_exchange_rate_value(self, obj):
        return float(obj.exchange_rate.usd_to_zig) if obj.exchange_rate else None


class ReservationSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    contact_name = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = '__all__'
        read_only_fields = ['reservation_number', 'created_at', 'updated_at']

    def get_contact_name(self, obj):
        if obj.contact:
            return obj.contact.full_name
        if obj.lead:
            return obj.lead.full_name
        return ''

    def get_is_expired(self, obj):
        import datetime
        return obj.valid_until < datetime.date.today() and obj.status not in ('converted', 'cancelled')


class HandoverItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = HandoverItem
        fields = '__all__'


class HandoverChecklistSerializer(serializers.ModelSerializer):
    items = HandoverItemSerializer(many=True, read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    pass_count = serializers.SerializerMethodField()
    fail_count = serializers.SerializerMethodField()

    class Meta:
        model = HandoverChecklist
        fields = '__all__'

    def get_pass_count(self, obj):
        return obj.items.filter(condition='pass').count()

    def get_fail_count(self, obj):
        return obj.items.filter(condition='fail').count()
