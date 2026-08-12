from rest_framework import serializers
from .models import CompanySettings


class CompanySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanySettings
        fields = '__all__'
        read_only_fields = ['updated_by', 'updated_at']
