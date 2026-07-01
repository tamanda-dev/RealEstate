from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, F, ExpressionWrapper, DecimalField as DjDecimalField
import datetime
from .models import Invoice, Payment, LateFeeRule
from .serializers import InvoiceSerializer, PaymentSerializer, LateFeeRuleSerializer


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

        # Create notification for tenant
        try:
            from notifications.models import Notification
            Notification.objects.create(
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
    queryset = Payment.objects.select_related('invoice', 'invoice__tenant', 'recorded_by')
    serializer_class = PaymentSerializer
    filterset_fields = ['invoice', 'payment_method']
    ordering_fields = ['payment_date', 'amount']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'tenant':
            return qs.filter(invoice__tenant=self.request.user)
        return qs


class LateFeeRuleViewSet(viewsets.ModelViewSet):
    queryset = LateFeeRule.objects.all()
    serializer_class = LateFeeRuleSerializer
    filterset_fields = ['property', 'is_active', 'fee_type']
