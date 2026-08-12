from rest_framework import serializers
from .models import WhatsAppConfig, WhatsAppTemplate, WhatsAppMessage


class WhatsAppConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppConfig
        exclude = ['access_token']   # never expose the token via API


class WhatsAppConfigWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppConfig
        fields = '__all__'


class WhatsAppTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppTemplate
        fields = '__all__'


class WhatsAppMessageSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source='template.name', read_only=True)
    sent_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WhatsAppMessage
        fields = '__all__'
        read_only_fields = ['sent_at', 'delivered_at', 'read_at', 'message_id']

    def get_sent_by_name(self, obj):
        return obj.sent_by.get_full_name() if obj.sent_by else 'System'


class SendMessageSerializer(serializers.Serializer):
    phone = serializers.CharField()
    message = serializers.CharField()
    template_id = serializers.IntegerField(required=False)
    lead_id = serializers.IntegerField(required=False)
    contact_id = serializers.IntegerField(required=False)
