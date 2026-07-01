from rest_framework import serializers
from .models import PropertyInspection, LandlordDisbursement
import calendar


class PropertyInspectionSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    inspector_name = serializers.SerializerMethodField()
    days_until = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = PropertyInspection
        fields = '__all__'

    def get_inspector_name(self, obj):
        return obj.inspector.get_full_name() if obj.inspector else ''

    def get_days_until(self, obj):
        import datetime
        return (obj.scheduled_date - datetime.date.today()).days

    def get_is_overdue(self, obj):
        import datetime
        return obj.status == 'scheduled' and obj.scheduled_date < datetime.date.today()


class LandlordDisbursementSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    owner_name = serializers.SerializerMethodField()
    period_label = serializers.SerializerMethodField()
    exchange_rate_value = serializers.SerializerMethodField()

    class Meta:
        model = LandlordDisbursement
        fields = '__all__'
        read_only_fields = [
            'agent_commission_usd', 'vat_on_commission_usd',
            'net_to_landlord_usd', 'net_to_landlord_zig', 'created_at', 'updated_at',
        ]

    def get_owner_name(self, obj):
        return obj.owner.get_full_name() if obj.owner else ''

    def get_period_label(self, obj):
        return f"{calendar.month_name[obj.period_month]} {obj.period_year}"

    def get_exchange_rate_value(self, obj):
        return float(obj.exchange_rate.usd_to_zig) if obj.exchange_rate else None
