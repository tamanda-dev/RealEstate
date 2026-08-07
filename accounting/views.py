from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db import transaction
from django.db.models import Sum, F
from decimal import Decimal, InvalidOperation
import csv
import io
import datetime
from .models import (Account, JournalEntry, JournalLine, TrustTransaction, Reconciliation, AuditLog,
                      BankStatementImport, BankStatementLine, Receipt)
from .serializers import (AccountSerializer, JournalEntrySerializer, JournalLineSerializer,
                           TrustTransactionSerializer, ReconciliationSerializer, AuditLogSerializer,
                           BankStatementImportSerializer, BankStatementLineSerializer, ReceiptSerializer)


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

    @action(detail=True, methods=['get'])
    def cashbook(self, request, pk=None):
        """Real-time cashbook: chronological posted movements on this account with a running balance."""
        account = self.get_object()
        date_from = parse_date(request.query_params.get('date_from', '') or '')
        date_to = parse_date(request.query_params.get('date_to', '') or '')

        lines = (JournalLine.objects
                 .filter(account=account, entry__status='posted')
                 .select_related('entry')
                 .order_by('entry__date', 'entry__created_at', 'id'))
        if date_from:
            lines = lines.filter(entry__date__gte=date_from)
        if date_to:
            lines = lines.filter(entry__date__lte=date_to)

        opening_balance = Decimal('0')
        if date_from:
            prior = JournalLine.objects.filter(
                account=account, entry__status='posted', entry__date__lt=date_from
            ).aggregate(d=Sum('debit'), c=Sum('credit'))
            opening_balance = (prior['d'] or Decimal('0')) - (prior['c'] or Decimal('0'))

        running = opening_balance
        entries = []
        for line in lines:
            running += line.debit - line.credit
            entries.append({
                'date': str(line.entry.date),
                'entry_number': line.entry.entry_number,
                'description': line.description or line.entry.description,
                'reference': line.entry.reference,
                'debit': float(line.debit),
                'credit': float(line.credit),
                'running_balance': float(running),
                'is_reconciled': BankStatementLine.objects.filter(matched_journal_line=line).exists(),
            })

        return Response({
            'account': AccountSerializer(account).data,
            'opening_balance': float(opening_balance),
            'closing_balance': float(running),
            'entries': entries,
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
        txn = serializer.save(created_by=self.request.user)
        if txn.transaction_type == 'deposit':
            Receipt.objects.create(
                source_type='trust_deposit', source_id=txn.pk,
                payer_name=txn.client_name, amount=txn.amount, currency='USD',
                reference=txn.reference, description=txn.description or f'Trust deposit — {txn.client_name}',
                property=txn.property, received_date=txn.date, issued_by=self.request.user,
            )
            # AML transaction monitoring — trust deposits have no linked platform user/contact
            # (client_name is free text), so this screens on amount/cash thresholds only.
            from aml.monitoring import screen_transaction
            screen_transaction(
                subject=None, amount=txn.amount, currency='USD', payment_method='',
                transaction_date=txn.date, source_type='trust_deposit', source_id=txn.pk,
                description=f'Trust deposit — {txn.client_name}',
            )


class ReconciliationViewSet(viewsets.ModelViewSet):
    queryset = Reconciliation.objects.select_related('account', 'reconciled_by')
    serializer_class = ReconciliationSerializer
    filterset_fields = ['account', 'is_reconciled']
    ordering_fields = ['period_end']

    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        recon = self.get_object()
        statement_balance = Decimal(str(request.data.get('statement_balance', recon.statement_balance)))
        with transaction.atomic():
            recon.statement_balance = statement_balance
            recon.difference = recon.book_balance - statement_balance
            if abs(recon.difference) < Decimal('0.01'):
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


class ReceiptViewSet(viewsets.ModelViewSet):
    """Receipts are mostly auto-generated (rent payments, trust deposits, reservation tokens);
    this also allows staff to manually record any other incoming-funds receipt."""
    queryset = Receipt.objects.select_related('property', 'issued_by')
    serializer_class = ReceiptSerializer
    filterset_fields = ['source_type', 'property']
    search_fields = ['receipt_number', 'payer_name', 'reference']
    ordering_fields = ['received_date', 'amount']

    def perform_create(self, serializer):
        serializer.save(issued_by=self.request.user, source_type=serializer.validated_data.get('source_type', 'other'))


def _parse_statement_amount(row):
    """Accept either a single signed 'amount' column or separate 'debit'/'credit' columns."""
    keys = {k.strip().lower(): v for k, v in row.items() if k}
    if keys.get('amount') not in (None, ''):
        return Decimal(str(keys['amount']).replace(',', '').strip())
    debit = keys.get('debit') or '0'
    credit = keys.get('credit') or '0'
    debit = Decimal(str(debit).replace(',', '').strip() or '0')
    credit = Decimal(str(credit).replace(',', '').strip() or '0')
    # On a bank statement, a credit to the account is money in (+), a debit is money out (-).
    return credit - debit


class BankStatementImportViewSet(viewsets.ModelViewSet):
    """Upload a bank statement CSV for a cash/bank Account and reconcile it against posted journal lines."""
    queryset = BankStatementImport.objects.select_related('account', 'imported_by').prefetch_related('lines')
    serializer_class = BankStatementImportSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ['account']
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        account_id = request.data.get('account')
        upload = request.FILES.get('file')
        if not account_id or not upload:
            return Response({'error': 'account and file are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            account = Account.objects.get(pk=account_id)
        except Account.DoesNotExist:
            return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            text = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response({'error': 'File must be UTF-8 encoded CSV'}, status=status.HTTP_400_BAD_REQUEST)

        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for i, row in enumerate(reader, start=2):
            keys = {k.strip().lower(): v for k, v in row.items() if k}
            date_str = (keys.get('date') or '').strip()
            date_val = parse_date(date_str)
            if not date_val:
                try:
                    date_val = datetime.datetime.strptime(date_str, '%d/%m/%Y').date()
                except (ValueError, TypeError):
                    return Response({'error': f'Row {i}: invalid or missing date "{date_str}"'},
                                     status=status.HTTP_400_BAD_REQUEST)
            try:
                amount = _parse_statement_amount(row)
            except InvalidOperation:
                return Response({'error': f'Row {i}: invalid amount'}, status=status.HTTP_400_BAD_REQUEST)
            rows.append({
                'date': date_val,
                'description': (keys.get('description') or keys.get('narrative') or '').strip()[:500],
                'reference': (keys.get('reference') or keys.get('ref') or '').strip()[:100],
                'amount': amount,
            })

        if not rows:
            return Response({'error': 'No data rows found in file'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            batch = BankStatementImport.objects.create(
                account=account, imported_by=request.user,
                file_name=getattr(upload, 'name', ''), line_count=len(rows),
            )
            BankStatementLine.objects.bulk_create([
                BankStatementLine(import_batch=batch, **row) for row in rows
            ])
        return Response(BankStatementImportSerializer(batch).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def auto_match(self, request, pk=None):
        """Match unmatched statement lines to unmatched posted JournalLines on the same account
        by exact amount within a small date window (bank clearing delay)."""
        batch = self.get_object()
        window_days = int(request.data.get('window_days', 5))
        matched = 0
        candidates_qs = JournalLine.objects.filter(
            account=batch.account, entry__status='posted',
            matched_statement_line__isnull=True,
        ).select_related('entry')

        for line in batch.lines.filter(is_matched=False):
            window_start = line.date - datetime.timedelta(days=window_days)
            window_end = line.date + datetime.timedelta(days=window_days)
            candidate = None
            for jl in candidates_qs.filter(entry__date__gte=window_start, entry__date__lte=window_end):
                net = jl.debit - jl.credit
                if net == line.amount:
                    candidate = jl
                    break
            if candidate:
                line.matched_journal_line = candidate
                line.is_matched = True
                line.save(update_fields=['matched_journal_line', 'is_matched'])
                candidates_qs = candidates_qs.exclude(pk=candidate.pk)
                matched += 1

        batch.matched_count = batch.lines.filter(is_matched=True).count()
        batch.save(update_fields=['matched_count'])
        return Response({'matched': matched, 'total_lines': batch.line_count,
                          'matched_total': batch.matched_count})

    @action(detail=True, methods=['post'], url_path='finalize-reconciliation')
    def finalize_reconciliation(self, request, pk=None):
        """Turn a matched (or partially matched) statement import into the account's
        official Reconciliation record for the period — the single place both this
        line-item workflow and the manual reconcile() workflow write to."""
        batch = self.get_object()
        statement_balance = request.data.get('statement_balance')
        if statement_balance is None:
            return Response({'error': 'statement_balance is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            statement_balance = Decimal(str(statement_balance))
        except InvalidOperation:
            return Response({'error': 'Invalid statement_balance'}, status=status.HTTP_400_BAD_REQUEST)

        lines = batch.lines.all()
        if not lines.exists():
            return Response({'error': 'This import has no statement lines'}, status=status.HTTP_400_BAD_REQUEST)
        period_start = request.data.get('period_start') or lines.order_by('date').first().date
        period_end = request.data.get('period_end') or lines.order_by('-date').first().date
        if isinstance(period_start, str):
            period_start = datetime.date.fromisoformat(period_start)
        if isinstance(period_end, str):
            period_end = datetime.date.fromisoformat(period_end)

        book_balance = (
            JournalLine.objects.filter(
                account=batch.account, entry__status='posted', entry__date__lte=period_end,
            ).aggregate(d=Sum('debit'), c=Sum('credit'))
        )
        book_balance = (book_balance['d'] or Decimal('0')) - (book_balance['c'] or Decimal('0'))
        difference = book_balance - statement_balance
        all_matched = not lines.filter(is_matched=False).exists()

        recon, _ = Reconciliation.objects.update_or_create(
            account=batch.account, period_start=period_start, period_end=period_end,
            defaults=dict(
                statement_balance=statement_balance, book_balance=book_balance, difference=difference,
                is_reconciled=all_matched and abs(difference) < Decimal('0.01'),
                import_batch=batch,
                reconciled_by=request.user if all_matched and abs(difference) < Decimal('0.01') else None,
                reconciled_at=timezone.now() if all_matched and abs(difference) < Decimal('0.01') else None,
            )
        )
        return Response(ReconciliationSerializer(recon).data)


class BankStatementLineViewSet(viewsets.ModelViewSet):
    queryset = BankStatementLine.objects.select_related('import_batch', 'matched_journal_line__entry')
    serializer_class = BankStatementLineSerializer
    filterset_fields = ['import_batch', 'is_matched']
    http_method_names = ['get', 'post', 'head', 'options']

    @action(detail=True, methods=['post'])
    def match(self, request, pk=None):
        line = self.get_object()
        journal_line_id = request.data.get('journal_line_id')
        try:
            journal_line = JournalLine.objects.get(pk=journal_line_id, account=line.import_batch.account)
        except JournalLine.DoesNotExist:
            return Response({'error': 'Journal line not found for this account'},
                             status=status.HTTP_404_NOT_FOUND)
        if JournalLine.objects.filter(pk=journal_line.pk).exclude(
                matched_statement_line__isnull=True).exists():
            return Response({'error': 'That journal line is already matched to another statement line'},
                             status=status.HTTP_400_BAD_REQUEST)
        line.matched_journal_line = journal_line
        line.is_matched = True
        line.save(update_fields=['matched_journal_line', 'is_matched'])
        batch = line.import_batch
        batch.matched_count = batch.lines.filter(is_matched=True).count()
        batch.save(update_fields=['matched_count'])
        return Response(BankStatementLineSerializer(line).data)

    @action(detail=True, methods=['post'])
    def unmatch(self, request, pk=None):
        line = self.get_object()
        line.matched_journal_line = None
        line.is_matched = False
        line.save(update_fields=['matched_journal_line', 'is_matched'])
        batch = line.import_batch
        batch.matched_count = batch.lines.filter(is_matched=True).count()
        batch.save(update_fields=['matched_count'])
        return Response(BankStatementLineSerializer(line).data)
    ordering_fields = ['timestamp']
