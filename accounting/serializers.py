from rest_framework import serializers
from .models import (Account, JournalEntry, JournalLine, TrustTransaction, Reconciliation,
                      AuditLog, BankStatementImport, BankStatementLine, Receipt)


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = '__all__'
        # balance is only ever mutated by JournalEntryViewSet.post_entry/void_entry
        # posting debits/credits — clients must not be able to overwrite it directly.
        read_only_fields = ['balance']


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
        # status/posted_at must only change via post_entry/void_entry, which also
        # validate debits == credits and post the balance updates atomically.
        read_only_fields = ['status', 'posted_at', 'entry_number', 'created_by']

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


class ReceiptSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    issued_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Receipt
        fields = '__all__'
        read_only_fields = ['receipt_number', 'issued_by']

    def get_issued_by_name(self, obj):
        return obj.issued_by.get_full_name() or obj.issued_by.username if obj.issued_by else 'System'


class BankStatementLineSerializer(serializers.ModelSerializer):
    matched_journal_entry_number = serializers.SerializerMethodField()

    class Meta:
        model = BankStatementLine
        fields = '__all__'
        read_only_fields = ['import_batch', 'is_matched', 'matched_journal_line']

    def get_matched_journal_entry_number(self, obj):
        if obj.matched_journal_line_id:
            return obj.matched_journal_line.entry.entry_number
        return None


class BankStatementImportSerializer(serializers.ModelSerializer):
    lines = BankStatementLineSerializer(many=True, read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = BankStatementImport
        fields = '__all__'
        read_only_fields = ['imported_by', 'line_count', 'matched_count']
