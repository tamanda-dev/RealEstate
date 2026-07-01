from rest_framework import serializers
from .models import Account, JournalEntry, JournalLine, TrustTransaction, Reconciliation, AuditLog


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = '__all__'


class JournalLineSerializer(serializers.ModelSerializer):
    account_name = serializers.SerializerMethodField()

    class Meta:
        model = JournalLine
        fields = '__all__'

    def get_account_name(self, obj):
        return obj.account.name if obj.account else ''


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True, read_only=True)
    total_debits = serializers.SerializerMethodField()
    total_credits = serializers.SerializerMethodField()
    is_balanced = serializers.SerializerMethodField()

    class Meta:
        model = JournalEntry
        fields = '__all__'

    def get_total_debits(self, obj):
        return float(obj.total_debits())

    def get_total_credits(self, obj):
        return float(obj.total_credits())

    def get_is_balanced(self, obj):
        return obj.is_balanced()


class TrustTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrustTransaction
        fields = '__all__'


class ReconciliationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reconciliation
        fields = '__all__'


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = '__all__'

    def get_username(self, obj):
        return obj.user.username if obj.user else 'System'
