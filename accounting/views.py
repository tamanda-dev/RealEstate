from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum, F
from .models import Account, JournalEntry, JournalLine, TrustTransaction, Reconciliation, AuditLog
from .serializers import (AccountSerializer, JournalEntrySerializer, JournalLineSerializer,
                           TrustTransactionSerializer, ReconciliationSerializer, AuditLogSerializer)


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    filterset_fields = ['account_type', 'subtype', 'is_trust_account', 'is_active', 'property']
    search_fields = ['name', 'account_number']

    @action(detail=False, methods=['get'])
    def trust_accounts(self, request):
        accounts = Account.objects.filter(is_trust_account=True, is_active=True)
        return Response(AccountSerializer(accounts, many=True).data)

    @action(detail=False, methods=['get'])
    def balances(self, request):
        return Response({
            'total_assets': float(Account.objects.filter(account_type='asset').aggregate(
                t=Sum('balance'))['t'] or 0),
            'total_liabilities': float(Account.objects.filter(account_type='liability').aggregate(
                t=Sum('balance'))['t'] or 0),
            'total_revenue': float(Account.objects.filter(account_type='revenue').aggregate(
                t=Sum('balance'))['t'] or 0),
            'total_expenses': float(Account.objects.filter(account_type='expense').aggregate(
                t=Sum('balance'))['t'] or 0),
            'trust_balance': float(Account.objects.filter(is_trust_account=True).aggregate(
                t=Sum('balance'))['t'] or 0),
            'net_income': float(
                (Account.objects.filter(account_type='revenue').aggregate(t=Sum('balance'))['t'] or 0)
                - (Account.objects.filter(account_type='expense').aggregate(t=Sum('balance'))['t'] or 0)
            ),
        })


class JournalEntryViewSet(viewsets.ModelViewSet):
    queryset = JournalEntry.objects.select_related('created_by', 'property').prefetch_related('lines__account')
    serializer_class = JournalEntrySerializer
    filterset_fields = ['status', 'property']
    search_fields = ['entry_number', 'description', 'reference']
    ordering_fields = ['date', 'created_at']

    def perform_create(self, serializer):
        import datetime
        import uuid
        entry_number = f"JE-{datetime.date.today().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
        serializer.save(created_by=self.request.user, entry_number=entry_number)

    @action(detail=True, methods=['post'])
    def post_entry(self, request, pk=None):
        entry = self.get_object()
        if entry.status == 'posted':
            return Response({'error': 'Entry already posted'}, status=status.HTTP_400_BAD_REQUEST)
        if not entry.is_balanced():
            return Response(
                {'error': f'Entry not balanced — debits: {entry.total_debits()}, credits: {entry.total_credits()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        with transaction.atomic():
            entry.status = 'posted'
            entry.posted_at = timezone.now()
            entry.save()
            for line in entry.lines.select_related('account').all():
                Account.objects.filter(pk=line.account_id).update(
                    balance=F('balance') + line.debit - line.credit
                )
        AuditLog.objects.create(
            user=request.user,
            action='post',
            model_name='JournalEntry',
            object_id=str(entry.pk),
            description=f'Posted journal entry {entry.entry_number}',
        )
        return Response(JournalEntrySerializer(entry).data)

    @action(detail=True, methods=['post'])
    def void_entry(self, request, pk=None):
        entry = self.get_object()
        if entry.status == 'voided':
            return Response({'error': 'Already voided'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            if entry.status == 'posted':
                for line in entry.lines.select_related('account').all():
                    Account.objects.filter(pk=line.account_id).update(
                        balance=F('balance') - line.debit + line.credit
                    )
            entry.status = 'voided'
            entry.save()
        AuditLog.objects.create(
            user=request.user,
            action='void',
            model_name='JournalEntry',
            object_id=str(entry.pk),
            description=f'Voided journal entry {entry.entry_number}',
        )
        return Response(JournalEntrySerializer(entry).data)


class TrustTransactionViewSet(viewsets.ModelViewSet):
    queryset = TrustTransaction.objects.select_related('account', 'property', 'created_by')
    serializer_class = TrustTransactionSerializer
    filterset_fields = ['account', 'transaction_type', 'reconciled', 'property']
    search_fields = ['client_name', 'description', 'reference']
    ordering_fields = ['date', 'amount']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ReconciliationViewSet(viewsets.ModelViewSet):
    queryset = Reconciliation.objects.select_related('account', 'reconciled_by')
    serializer_class = ReconciliationSerializer
    filterset_fields = ['account', 'is_reconciled']
    ordering_fields = ['period_end']

    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        recon = self.get_object()
        statement_balance = request.data.get('statement_balance', recon.statement_balance)
        with transaction.atomic():
            recon.statement_balance = statement_balance
            recon.difference = float(recon.book_balance) - float(statement_balance)
            if abs(recon.difference) < 0.01:
                recon.is_reconciled = True
                recon.reconciled_by = request.user
                recon.reconciled_at = timezone.now()
                TrustTransaction.objects.filter(
                    account=recon.account,
                    date__gte=recon.period_start,
                    date__lte=recon.period_end
                ).update(reconciled=True, reconciled_at=timezone.now())
            recon.save()
        AuditLog.objects.create(
            user=request.user, action='reconcile', model_name='Reconciliation',
            object_id=str(recon.pk),
            description=f'Reconciled account {recon.account} for {recon.period_start} - {recon.period_end}',
        )
        return Response(ReconciliationSerializer(recon).data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user')
    serializer_class = AuditLogSerializer
    filterset_fields = ['action', 'model_name', 'user']
    ordering_fields = ['timestamp']
