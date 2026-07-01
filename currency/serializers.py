from rest_framework import serializers
from .models import ExchangeRate


class ExchangeRateSerializer(serializers.ModelSerializer):
    zig_to_usd = serializers.ReadOnlyField()
    set_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ExchangeRate
        fields = '__all__'

    def get_set_by_name(self, obj):
        return obj.set_by.get_full_name() if obj.set_by else ''
