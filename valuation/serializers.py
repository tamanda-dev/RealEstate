from rest_framework import serializers
from .models import Valuation, Comparable, PriceTrend, SalesComparablesDB, ValuationMethodology


class SalesComparablesDBSerializer(serializers.ModelSerializer):
    added_by_name = serializers.SerializerMethodField()
    property_type_display = serializers.CharField(source='get_property_type_display', read_only=True)

    class Meta:
        model = SalesComparablesDB
        fields = '__all__'
        read_only_fields = ['price_per_sqm_land_usd', 'price_per_sqm_floor_usd', 'created_at', 'updated_at']

    def get_added_by_name(self, obj):
        return obj.added_by.get_full_name() if obj.added_by else ''


class ValuationMethodologySerializer(serializers.ModelSerializer):
    class Meta:
        model = ValuationMethodology
        fields = '__all__'


class ComparableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comparable
        fields = '__all__'


class ValuationSerializer(serializers.ModelSerializer):
    comparables = ComparableSerializer(many=True, read_only=True)
    methodologies = ValuationMethodologySerializer(many=True, read_only=True)
    property_name = serializers.SerializerMethodField()

    class Meta:
        model = Valuation
        fields = '__all__'

    def get_property_name(self, obj):
        return obj.property.name if obj.property else ''


class PriceTrendSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceTrend
        fields = '__all__'
