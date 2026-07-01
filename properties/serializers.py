from rest_framework import serializers
from .models import Property, PropertyImage, Unit


class PropertyImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyImage
        fields = '__all__'


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = '__all__'


class PropertySerializer(serializers.ModelSerializer):
    images = PropertyImageSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = '__all__'

    def get_owner_name(self, obj):
        return obj.owner.get_full_name() if obj.owner else ''


class PropertyListSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    unit_count = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = ['id', 'name', 'property_type', 'status', 'address', 'city', 'state',
                  'country', 'bedrooms', 'bathrooms', 'square_feet', 'year_built',
                  'monthly_rent', 'current_value', 'description',
                  'image', 'owner_name', 'unit_count', 'created_at']

    def get_owner_name(self, obj):
        return obj.owner.get_full_name() if obj.owner else ''

    def get_unit_count(self, obj):
        return obj.units.count()
