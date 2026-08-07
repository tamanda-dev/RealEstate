from rest_framework import serializers
from .models import Lease, LeaseClause, LeaseRenewal, RentReviewLog


class LeaseClauseSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaseClause
        fields = '__all__'


class LeaseRenewalSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaseRenewal
        fields = '__all__'


class RentReviewLogSerializer(serializers.ModelSerializer):
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RentReviewLog
        fields = '__all__'
        read_only_fields = ['reviewed_by']

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else ''


class LeaseSerializer(serializers.ModelSerializer):
    renewals = LeaseRenewalSerializer(many=True, read_only=True)
    rent_reviews = RentReviewLogSerializer(many=True, read_only=True)
    tenant_name = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    unit_number = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()
    is_expiring_soon = serializers.SerializerMethodField()
    days_until_rent_review = serializers.SerializerMethodField()
    is_rent_review_due_soon = serializers.SerializerMethodField()

    class Meta:
        model = Lease
        fields = '__all__'

    def get_tenant_name(self, obj):
        return obj.tenant.get_full_name() if obj.tenant else ''

    def get_property_name(self, obj):
        return obj.property.name if obj.property else ''

    def get_unit_number(self, obj):
        return obj.unit.unit_number if obj.unit else None

    def get_days_until_expiry(self, obj):
        return obj.days_until_expiry()

    def get_is_expiring_soon(self, obj):
        return obj.is_expiring_soon()

    def get_days_until_rent_review(self, obj):
        return obj.days_until_rent_review()

    def get_is_rent_review_due_soon(self, obj):
        return obj.is_rent_review_due_soon()

    def validate(self, data):
        start = data.get('start_date') or (self.instance.start_date if self.instance else None)
        end = data.get('end_date') or (self.instance.end_date if self.instance else None)
        if start and end and end <= start:
            raise serializers.ValidationError({'end_date': 'End date must be after start date.'})
        return data
