from rest_framework import serializers
from .models import Vendor, WorkOrder, MaintenanceExpense, PreventiveSchedule, ApprovedContractor


class PreventiveScheduleSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    days_until_due = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = PreventiveSchedule
        fields = '__all__'

    def get_days_until_due(self, obj):
        return obj.days_until_due()

    def get_is_overdue(self, obj):
        return obj.is_overdue()


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'


class ApprovedContractorSerializer(serializers.ModelSerializer):
    vendor_detail = VendorSerializer(source='vendor', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    landlord_name = serializers.SerializerMethodField()

    class Meta:
        model = ApprovedContractor
        fields = '__all__'
        read_only_fields = ['landlord', 'approved_at']

    def get_landlord_name(self, obj):
        return obj.landlord.get_full_name() or obj.landlord.username


class MaintenanceExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceExpense
        fields = '__all__'


class WorkOrderSerializer(serializers.ModelSerializer):
    expenses = MaintenanceExpenseSerializer(many=True, read_only=True)
    property_name = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrder
        fields = '__all__'

    def get_property_name(self, obj):
        return obj.property.name if obj.property else ''

    def get_vendor_name(self, obj):
        return obj.vendor.name if obj.vendor else ''
