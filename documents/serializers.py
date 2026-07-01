from rest_framework import serializers
from .models import PropertyDocument


class PropertyDocumentSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    filename = serializers.SerializerMethodField()
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = PropertyDocument
        fields = '__all__'
        read_only_fields = ['file_size_kb', 'created_at', 'updated_at']

    def get_filename(self, obj):
        return obj.filename()

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else ''

    def get_is_expired(self, obj):
        import datetime
        return obj.expiry_date and obj.expiry_date < datetime.date.today()
