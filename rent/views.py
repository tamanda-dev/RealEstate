from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, F, ExpressionWrapper, DecimalField as DjDecimalField
from dateutil.relativedelta import relativedelta
import datetime
from .models import Invoice, Payment, Refund, LateFeeRule, RecurringInvoiceProfile
from .serializers import (InvoiceSerializer, PaymentSerializer, RefundSerializer,
                           LateFeeRuleSerializer, RecurringInvoiceProfileSerializer)

FINANCE_ROLES = ('admin', 'accountant', 'property_manager')


def generate_invoice_from_profile(profile):
    """Recurring Invoicing engine: create the next Invoice for a profile's lease, in the
    profile's billing currency, then advance the profile to its next generation date.
    Shared by RecurringInvoiceProfileViewSet.generate_now and the
    generate_recurring_invoices management command (cron-triggered)."""
    from currency.models import ExchangeRate
    lease = profile.lease
    period_start = profile.next_generation_date
    months = 3 if profile.frequency == 'quarterly' else 1
    period_end = period_start + relativedelta(months=months, days=-1)
    due_date = period_start + datetime.timedelta(days=profile.due_in_days)

    exchange_rate = ExchangeRate.get_latest() if profile.currency == 'ZiG' else None

    invoice = Invoice.objects.create(
        tenant=lease.tenant, property=lease.property, unit=lease.unit,
        period_start=period_start, period_end=period_end, due_date=due_date,
        rent_amount=lease.monthly_rent, other_charges=profile.other_charges,
        currency=profile.currency, exchange_rate=exchange_rate,
        recurring_profile=profile, status='sent',
    )
    profile.advance_next_date()
    profile.save(update_fields=['next_generation_date'])
    return invoice


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related('tenant', 'property', 'unit').prefetch_related('payments')
    serializer_class = InvoiceSerializer
    search_fields = ['invoice_number', 'tenant__first_name', 'tenant__last_name']
    filterset_fields = ['status', 'tenant', 'property']
    ordering_fields = ['due_date', 'created_at', 'total_amount']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == 'tenant':
            return qs.filter(tenant=user)
        if user.role in ('landlord', 'owner'):
            return qs.filter(property__owner=user)
        return qs

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        invoice = self.get_object()
        amount = request.data.get('amount')
        if amount is None:
            return Response({'error': 'amount is required'}, status=status.HTTP_400_BAD_REQUEST)

        from decimal import Decimal, InvalidOperation
        try:
            amount_dec = Decimal(str(amount))
        except InvalidOperation:
            return Response({'error': 'Invalid amount'}, status=status.HTTP_400_BAD_REQUEST)

        balance = invoice.total_amount - invoice.paid_amount
        if amount_dec > balance:
            return Response(
                {'error': f'Payment ${amount_dec} exceeds balance due ${balance}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        payment_date = request.data.get('payment_date', datetime.date.today().isoformat())

        # Duplicate detection: the same amount posted against the same invoice on the same
        # day is far more often a double-click/re-submit than two genuinely separate
        # payments — warn once and require an explicit confirm to push it through anyway.
        is_duplicate = Payment.objects.filter(
            invoice=invoice, amount=amount_dec, payment_date=payment_date, status='posted',
        ).exists()
        if is_duplicate and not request.data.get('confirm_duplicate'):
            return Response({
                'error': f'A posted payment of ${amount_dec} already exists for this invoice on {payment_date}.',
                'duplicate_warning': True,
            }, status=status.HTTP_409_CONFLICT)

        payment = Payment.objects.create(
            invoice=invoice,
            amount=amount_dec,
            payment_date=payment_date,
            payment_method=request.data.get('payment_method', 'bank_transfer'),
            reference_number=request.data.get('reference_number', ''),
            notes=request.data.get('notes', ''),
            recorded_by=request.user,
        )

        invoice.paid_amount += payment.amount
        if invoice.paid_amount >= invoice.total_amount:
            invoice.status = 'paid'
        elif invoice.paid_amount > 0:
            invoice.status = 'partial'
        invoice.save()

        # payment.amount is always stored in USD (the system's base currency — see
        # Invoice.total_amount_zig for how ZiG is only ever a converted display figure).
        # When the invoice is ZiG-denominated, convert for the receipt so its amount and
        # currency label actually match what the tenant paid, instead of mislabeling a
        # USD figure as ZiG (or vice versa).
        receipt_amount, receipt_currency = payment.amount, 'USD'
        if invoice.currency == 'ZiG':
            from currency.models import ExchangeRate
            rate = invoice.exchange_rate or ExchangeRate.get_latest()
            if rate:
                receipt_amount = rate.convert_usd_to_zig(payment.amount)
                receipt_currency = 'ZiG'

        from accounting.models import Receipt
        Receipt.objects.create(
            source_type='rent_payment', source_id=payment.pk,
            payer_name=invoice.tenant.get_full_name() or invoice.tenant.username,
            amount=receipt_amount, currency=receipt_currency, payment_method=payment.payment_method,
            reference=payment.reference_number, description=f'Rent payment — {invoice.invoice_number}',
            property=invoice.property, received_date=payment.payment_date, issued_by=request.user,
        )

        # AML transaction monitoring
        from aml.monitoring import screen_transaction, get_or_create_profile_for_user
        screen_transaction(
            subject=get_or_create_profile_for_user(invoice.tenant),
            amount=payment.amount, currency='USD', payment_method=payment.payment_method,
            transaction_date=(datetime.date.fromisoformat(payment_date)
                               if isinstance(payment_date, str) else payment_date),
            source_type='rent_payment', source_id=payment.pk,
            description=f'Rent payment — {invoice.invoice_number}',
        )

        # Auto-distribution: a fully-paid invoice from a recurring profile flagged for it
        # immediately recomputes that property's landlord disbursement for the period.
        profile = invoice.recurring_profile
        if invoice.status == 'paid' and profile and profile.auto_generate_disbursement and invoice.property:
            from lettings.views import generate_landlord_disbursement, DisbursementOwnerMissing
            try:
                generate_landlord_disbursement(
                    invoice.property, invoice.period_start.month, invoice.period_start.year,
                    commission_rate=10, generated_by=request.user,
                )
            except DisbursementOwnerMissing:
                # Don't let a missing property owner block recording a payment that already
                # happened — surface it as an actionable notification instead.
                from notifications.dispatch import notify
                from django.contrib.auth import get_user_model
                User = get_user_model()
                for manager in User.objects.filter(role__in=['admin', 'manager', 'property_manager']):
                    notify(
                        user=manager, notification_type='system', priority='high',
                        title='Disbursement Not Generated — Missing Property Owner',
                        message=f'Payment for {invoice.invoice_number} was recorded, but the landlord '
                                f'disbursement could not be auto-generated because '
                                f'"{invoice.property.name}" has no owner on file.',
                        link='/properties', related_object_id=invoice.property.pk,
                    )

        # Notify tenant (in-app + email/SMS if they have contact details on file)
        try:
            from notifications.dispatch import notify
            notify(
                user=invoice.tenant,
                notification_type='payment_received',
                title='Payment Recorded',
                message=f'Payment of ${amount_dec} received for invoice {invoice.invoice_number}.',
                link='/rent',
            )
        except Exception:
            pass

        return Response(InvoiceSerializer(invoice).data)

    @action(detail=False, methods=['post'])
    def apply_late_fees(self, request):
        today = datetime.date.today()
        overdue = Invoice.objects.filter(status__in=['sent', 'partial'], due_date__lt=today)
        updated = 0
        for invoice in overdue:
            rule = (
                LateFeeRule.objects.filter(property=invoice.property, is_active=True).first()
                or LateFeeRule.objects.filter(property__isnull=True, is_active=True).first()
            )
            if rule and invoice.late_fee == 0:
                days_late = (today - invoice.due_date).days
                if days_late > rule.grace_period_days:
                    if rule.fee_type == 'flat':
                        fee = rule.fee_amount
                    else:
                        fee = invoice.rent_amount * rule.fee_amount / 100
                    if rule.max_fee:
                        fee = min(fee, rule.max_fee)
                    invoice.late_fee = fee
                    invoice.status = 'overdue'
                    invoice.save()
                    updated += 1
        return Response({'updated': updated, 'message': f'{updated} invoices updated with late fees'})

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        qs = Invoice.objects.all()
        if request.user.role == 'tenant':
            qs = qs.filter(tenant=request.user)
        elif request.user.role in ('landlord', 'owner'):
            qs = qs.filter(property__owner=request.user)
        stats = {
            'total_invoiced': qs.aggregate(t=Sum('total_amount'))['t'] or 0,
            'total_collected': qs.aggregate(p=Sum('paid_amount'))['p'] or 0,
            'overdue_count': qs.filter(status='overdue').count(),
            'overdue_amount': float(
                qs.filter(status='overdue').aggregate(
                    a=Sum(ExpressionWrapper(
                        F('total_amount') - F('paid_amount'),
                        output_field=DjDecimalField()
                    ))
                )['a'] or 0
            ),
            'pending_count': qs.filter(status__in=['sent', 'partial']).count(),
        }
        return Response(stats)


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related('invoice', 'invoice__tenant', 'recorded_by', 'reversed_by')
    serializer_class = PaymentSerializer
    filterset_fields = ['invoice', 'payment_method', 'status']
    ordering_fields = ['payment_date', 'amount']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'tenant':
            return qs.filter(invoice__tenant=self.request.user)
        return qs

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        """A payment that was recorded in error or a genuine duplicate — un-does its effect
        on the invoice entirely. Distinct from a Refund: nothing is being paid back to the
        tenant here, the payment simply never should have counted."""
        if request.user.role not in FINANCE_ROLES:
            return Response({'error': 'Only admin, accountant or property manager can reverse a payment.'},
                             status=status.HTTP_403_FORBIDDEN)
        payment = self.get_object()
        if payment.status == 'reversed':
            return Response({'error': 'Payment is already reversed.'}, status=status.HTTP_400_BAD_REQUEST)
        reason = request.data.get('reason')
        if not reason:
            return Response({'error': 'A reason is required to reverse a payment.'}, status=status.HTTP_400_BAD_REQUEST)

        from decimal import Decimal
        payment.status = 'reversed'
        payment.reversed_by = request.user
        payment.reversed_at = timezone.now()
        payment.reversal_reason = reason
        payment.save()

        invoice = payment.invoice
        invoice.paid_amount = max(invoice.paid_amount - payment.amount, Decimal('0'))
        today = datetime.date.today()
        if invoice.paid_amount <= 0:
            invoice.status = 'overdue' if invoice.due_date < today else 'sent'
        elif invoice.paid_amount < invoice.total_amount:
            invoice.status = 'partial'
        invoice.save()

        return Response(PaymentSerializer(payment).data)


class RefundViewSet(viewsets.ModelViewSet):
    """Requested -> Approved -> Processed, mirroring the security-deposit refund workflow —
    deliberately three separate actors/timestamps rather than one status flip, so a refund
    can't be both requested and paid out by the same click."""
    queryset = Refund.objects.select_related('payment', 'payment__invoice', 'requested_by', 'approved_by')
    serializer_class = RefundSerializer
    filterset_fields = ['status', 'payment']
    http_method_names = ['get', 'post', 'head', 'options']

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if request.user.role not in FINANCE_ROLES:
            return Response({'error': 'Only admin, accountant or property manager can approve a refund.'},
                             status=status.HTTP_403_FORBIDDEN)
        refund = self.get_object()
        if refund.status != 'requested':
            return Response({'error': f'Refund is already {refund.status}.'}, status=status.HTTP_400_BAD_REQUEST)
        refund.status = 'approved'
        refund.approved_by = request.user
        refund.approved_at = timezone.now()
        refund.save()
        return Response(RefundSerializer(refund).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if request.user.role not in FINANCE_ROLES:
            return Response({'error': 'Only admin, accountant or property manager can reject a refund.'},
                             status=status.HTTP_403_FORBIDDEN)
        refund = self.get_object()
        if refund.status not in ('requested', 'approved'):
            return Response({'error': f'Refund is already {refund.status}.'}, status=status.HTTP_400_BAD_REQUEST)
        refund.status = 'rejected'
        refund.rejection_reason = request.data.get('reason', '')
        refund.save()
        return Response(RefundSerializer(refund).data)

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Marks the refund as actually paid out and reduces the invoice's paid_amount —
        money genuinely left the business at this point, distinct from approval."""
        if request.user.role not in FINANCE_ROLES:
            return Response({'error': 'Only admin, accountant or property manager can process a refund.'},
                             status=status.HTTP_403_FORBIDDEN)
        refund = self.get_object()
        if refund.status != 'approved':
            return Response({'error': 'Refund must be approved before it can be processed.'},
                             status=status.HTTP_400_BAD_REQUEST)

        from decimal import Decimal
        refund.status = 'processed'
        refund.processed_at = timezone.now()
        refund.refund_method = request.data.get('refund_method', refund.refund_method)
        refund.refund_reference = request.data.get('refund_reference', refund.refund_reference)
        refund.save()

        invoice = refund.payment.invoice
        invoice.paid_amount = max(invoice.paid_amount - refund.amount, Decimal('0'))
        today = datetime.date.today()
        if invoice.paid_amount <= 0:
            invoice.status = 'overdue' if invoice.due_date < today else 'sent'
        elif invoice.paid_amount < invoice.total_amount:
            invoice.status = 'partial'
        invoice.save()

        return Response(RefundSerializer(refund).data)


class LateFeeRuleViewSet(viewsets.ModelViewSet):
    queryset = LateFeeRule.objects.all()
    serializer_class = LateFeeRuleSerializer
    filterset_fields = ['property', 'is_active', 'fee_type']


class RecurringInvoiceProfileViewSet(viewsets.ModelViewSet):
    """Recurring Invoicing: manage per-lease auto-billing schedules and trigger generation."""
    queryset = RecurringInvoiceProfile.objects.select_related('lease__tenant', 'lease__property')
    serializer_class = RecurringInvoiceProfileSerializer
    filterset_fields = ['lease', 'is_active', 'frequency', 'currency']

    @action(detail=True, methods=['post'])
    def generate_now(self, request, pk=None):
        profile = self.get_object()
        if not profile.is_active:
            return Response({'error': 'Profile is not active'}, status=status.HTTP_400_BAD_REQUEST)
        invoice = generate_invoice_from_profile(profile)
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)
