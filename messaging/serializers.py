from rest_framework import serializers
from .models import EmailMessage, SMSMessage, EmailTemplate


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = '__all__'


class EmailMessageSerializer(serializers.ModelSerializer):
    sent_by_name = serializers.SerializerMethodField()
    lead_name = serializers.CharField(source='lead.full_name', read_only=True, default='')
    contact_name = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()

    class Meta:
        model = EmailMessage
        fields = '__all__'
        read_only_fields = ['status', 'error_message', 'sent_by', 'sent_at']

    def get_sent_by_name(self, obj):
        return obj.sent_by.get_full_name() if obj.sent_by else 'System'

    def get_contact_name(self, obj):
        return str(obj.contact) if obj.contact else ''

    def get_recipient_name(self, obj):
        return obj.recipient.get_full_name() or obj.recipient.username if obj.recipient else ''


class SendEmailSerializer(serializers.Serializer):
    to_email = serializers.EmailField()
    to_name = serializers.CharField(required=False, allow_blank=True)
    recipient_id = serializers.IntegerField(required=False)
    subject = serializers.CharField()
    body = serializers.CharField()
    lead_id = serializers.IntegerField(required=False)
    contact_id = serializers.IntegerField(required=False)


class BulkSendEmailSerializer(serializers.Serializer):
    recipient_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    template_id = serializers.IntegerField(required=False)
    subject = serializers.CharField(required=False, allow_blank=True)
    body = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        if not data.get('template_id') and not (data.get('subject') and data.get('body')):
            raise serializers.ValidationError('Provide either template_id or both subject and body.')
        return data


class SMSMessageSerializer(serializers.ModelSerializer):
    sent_by_name = serializers.SerializerMethodField()
    lead_name = serializers.CharField(source='lead.full_name', read_only=True, default='')
    contact_name = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()

    class Meta:
        model = SMSMessage
        fields = '__all__'
        read_only_fields = ['status', 'twilio_sid', 'error_message', 'sent_by', 'sent_at']

    def get_sent_by_name(self, obj):
        return obj.sent_by.get_full_name() if obj.sent_by else 'System'

    def get_contact_name(self, obj):
        return str(obj.contact) if obj.contact else ''

    def get_recipient_name(self, obj):
        return obj.recipient.get_full_name() or obj.recipient.username if obj.recipient else ''


class SendSMSSerializer(serializers.Serializer):
    to_phone = serializers.CharField()
    to_name = serializers.CharField(required=False, allow_blank=True)
    recipient_id = serializers.IntegerField(required=False)
    body = serializers.CharField()
    lead_id = serializers.IntegerField(required=False)
    contact_id = serializers.IntegerField(required=False)
