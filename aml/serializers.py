from rest_framework import serializers

from .models import KYCProfile, MonitoredTransaction


class KYCProfileSerializer(serializers.ModelSerializer):
    subject_type = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = KYCProfile
        fields = '__all__'
        read_only_fields = ['risk_score', 'risk_rating', 'verified_by', 'verified_at',
                             'created_at', 'updated_at']

    def get_subject_type(self, obj):
        return 'user' if obj.user_id else 'contact'

    def get_verified_by_name(self, obj):
        return obj.verified_by.get_full_name() if obj.verified_by else ''

    def validate(self, data):
        user = data.get('user', getattr(self.instance, 'user', None))
        contact = data.get('contact', getattr(self.instance, 'contact', None))
        if bool(user) == bool(contact):
            raise serializers.ValidationError('Exactly one of user or contact must be set.')
        return data


class MonitoredTransactionSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.full_name', read_only=True)
    subject_risk_rating = serializers.CharField(source='subject.risk_rating', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MonitoredTransaction
        fields = '__all__'
        read_only_fields = ['subject', 'source_type', 'source_id', 'amount', 'currency',
                             'payment_method', 'transaction_date', 'description', 'flags',
                             'risk_level', 'reported_at', 'goaml_reference', 'created_at']

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else ''
