from decimal import Decimal

from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from dateutil.relativedelta import relativedelta
import datetime
from .models import (Lease, LeaseClause, LeaseRenewal, RentReviewLog, SecurityDeposit,
                      DepositDeduction, Guarantor)
from .serializers import (LeaseSerializer, LeaseClauseSerializer, LeaseRenewalSerializer,
                           RentReviewLogSerializer, SecurityDepositSerializer,
                           DepositDeductionSerializer, GuarantorSerializer)


class LeaseClauseViewSet(viewsets.ModelViewSet):
    queryset = LeaseClause.objects.all()
    serializer_class = LeaseClauseSerializer
    filterset_fields = ['category', 'is_standard']
    search_fields = ['title', 'content']


class LeaseViewSet(viewsets.ModelViewSet):
    queryset = Lease.objects.select_related('property', 'tenant', 'unit').prefetch_related('clauses', 'renewals')
    serializer_class = LeaseSerializer
    search_fields = ['tenant__first_name', 'tenant__last_name', 'property__name']
    filterset_fields = ['status', 'property', 'tenant']
    ordering_fields = ['start_date', 'end_date', 'monthly_rent']

    def perform_create(self, serializer):
        lease = serializer.save()
        # Deposit lifecycle tracking is separate from the flat Lease.security_deposit terms
        # field — auto-create it here so every lease with a deposit gets one from day one.
        if lease.security_deposit and lease.security_deposit > 0:
            SecurityDeposit.objects.create(lease=lease, amount_due=lease.security_deposit)

    @action(detail=True, methods=['post'], url_path='terminate-early')
    def terminate_early(self, request, pk=None):
        lease = self.get_object()
        if lease.status == 'terminated':
            return Response({'error': 'Lease is already terminated.'}, status=status.HTTP_400_BAD_REQUEST)
        reason = request.data.get('reason')
        if not reason:
            return Response({'error': 'A reason is required to terminate a lease early.'},
                             status=status.HTTP_400_BAD_REQUEST)
        term_date = request.data.get('termination_date') or datetime.date.today().isoformat()
        lease.status = 'terminated'
        lease.early_termination_date = term_date
        lease.early_termination_reason = reason
        lease.save(update_fields=['status', 'early_termination_date', 'early_termination_reason'])
        return Response(LeaseSerializer(lease).data)

    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        days = int(request.query_params.get('days', 60))
        future = datetime.date.today() + datetime.timedelta(days=days)
        leases = Lease.objects.filter(
            status='active', end_date__lte=future, end_date__gte=datetime.date.today()
        )
        serializer = LeaseSerializer(leases, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def initiate_renewal(self, request, pk=None):
        lease = self.get_object()
        # Accept frontend-friendly names (new_end_date / new_monthly_rent)
        # as well as direct model field names (proposed_end / proposed_rent)
        proposed_start = (
            request.data.get('proposed_start')
            or lease.end_date.isoformat()
        )
        proposed_end = (
            request.data.get('proposed_end')
            or request.data.get('new_end_date')
        )
        proposed_rent = (
            request.data.get('proposed_rent')
            or request.data.get('new_monthly_rent')
            or str(lease.monthly_rent)
        )
        data = {
            'lease': lease.pk,
            'proposed_start': proposed_start,
            'proposed_end': proposed_end,
            'proposed_rent': proposed_rent,
            'notes': request.data.get('notes', ''),
        }
        serializer = LeaseRenewalSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            lease.status = 'renewal_pending'
            lease.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        today = datetime.date.today()
        future_60 = today + datetime.timedelta(days=60)
        stats = {
            'active': Lease.objects.filter(status='active').count(),
            'expiring_60_days': Lease.objects.filter(
                status='active', end_date__lte=future_60, end_date__gte=today).count(),
            'renewal_pending': Lease.objects.filter(status='renewal_pending').count(),
            'expired': Lease.objects.filter(status='expired').count(),
        }
        return Response(stats)

    @action(detail=True, methods=['post'], url_path='conduct-rent-review')
    def conduct_rent_review(self, request, pk=None):
        """Lease Diary: log a completed rent review, apply the new rent, and — if the
        lease has a recurring frequency — automatically schedule the next review date."""
        lease = self.get_object()
        new_rent = request.data.get('new_rent')
        if new_rent is None:
            return Response({'error': 'new_rent is required'}, status=status.HTTP_400_BAD_REQUEST)

        review_date_str = request.data.get('review_date')
        review_date = datetime.date.fromisoformat(review_date_str) if review_date_str else datetime.date.today()

        review = RentReviewLog.objects.create(
            lease=lease, review_date=review_date,
            old_rent=lease.monthly_rent, new_rent=new_rent,
            notes=request.data.get('notes', ''), reviewed_by=request.user,
        )
        lease.monthly_rent = new_rent
        if lease.rent_review_frequency_months:
            lease.next_rent_review_date = review_date + relativedelta(months=lease.rent_review_frequency_months)
        else:
            lease.next_rent_review_date = None
        lease.save(update_fields=['monthly_rent', 'next_rent_review_date'])
        return Response(LeaseSerializer(lease).data)

    @action(detail=False, methods=['get'], url_path='lease-diary')
    def lease_diary(self, request):
        """Unified chronological feed of lease events — expiries, pending renewals, and
        rent reviews — within a window (default 90 days out, plus anything already overdue)."""
        days = int(request.query_params.get('days', 90))
        today = datetime.date.today()
        horizon = today + datetime.timedelta(days=days)

        events = []
        leases = Lease.objects.filter(status__in=['active', 'renewal_pending']).select_related('tenant', 'property')
        for lease in leases:
            if lease.end_date <= horizon:
                events.append({
                    'type': 'renewal_pending' if lease.status == 'renewal_pending' else 'expiry',
                    'date': str(lease.end_date),
                    'lease_id': lease.pk,
                    'tenant_name': lease.tenant.get_full_name() or lease.tenant.username,
                    'property_name': lease.property.name,
                    'is_overdue': lease.end_date < today,
                    'description': f'Lease {"pending renewal" if lease.status == "renewal_pending" else "expires"} '
                                    f'{lease.end_date}',
                })
            if lease.next_rent_review_date and lease.next_rent_review_date <= horizon:
                events.append({
                    'type': 'rent_review',
                    'date': str(lease.next_rent_review_date),
                    'lease_id': lease.pk,
                    'tenant_name': lease.tenant.get_full_name() or lease.tenant.username,
                    'property_name': lease.property.name,
                    'is_overdue': lease.next_rent_review_date < today,
                    'description': f'Rent review due for {lease.property.name} '
                                    f'(current rent ${lease.monthly_rent})',
                })

        events.sort(key=lambda e: e['date'])
        return Response({
            'events': events,
            'window_days': days,
            'generated_at': today.isoformat(),
        })


class LeaseRenewalViewSet(viewsets.ModelViewSet):
    queryset = LeaseRenewal.objects.select_related('lease')
    serializer_class = LeaseRenewalSerializer
    filterset_fields = ['lease', 'status']

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Applying an accepted renewal was previously a no-op — the proposal sat in
        LeaseRenewal forever while Lease.start_date/end_date/monthly_rent never changed.
        This actually carries the proposed terms onto the lease."""
        renewal = self.get_object()
        if renewal.status != 'pending':
            return Response({'error': f'Renewal is already {renewal.status}.'},
                             status=status.HTTP_400_BAD_REQUEST)
        lease = renewal.lease
        renewal.status = 'accepted'
        renewal.save(update_fields=['status'])
        lease.start_date = renewal.proposed_start
        lease.end_date = renewal.proposed_end
        lease.monthly_rent = renewal.proposed_rent
        lease.status = 'active'
        lease.save(update_fields=['start_date', 'end_date', 'monthly_rent', 'status'])
        return Response(LeaseSerializer(lease).data)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        renewal = self.get_object()
        if renewal.status != 'pending':
            return Response({'error': f'Renewal is already {renewal.status}.'},
                             status=status.HTTP_400_BAD_REQUEST)
        renewal.status = 'declined'
        renewal.save(update_fields=['status'])
        lease = renewal.lease
        if lease.status == 'renewal_pending':
            lease.status = 'active' if lease.days_until_expiry() > 0 else 'expired'
            lease.save(update_fields=['status'])
        return Response(LeaseSerializer(lease).data)


class GuarantorViewSet(viewsets.ModelViewSet):
    queryset = Guarantor.objects.select_related('lease')
    serializer_class = GuarantorSerializer
    filterset_fields = ['lease']


class SecurityDepositViewSet(viewsets.ModelViewSet):
    """Deposit lifecycle: receive (partial payments accumulate until amount_due is met) ->
    held -> request-refund (staff compute the refundable balance) -> approve-refund
    (finance/admin sign-off, separate actor from whoever requested it)."""
    queryset = SecurityDeposit.objects.select_related(
        'lease', 'lease__tenant', 'lease__property').prefetch_related('deductions')
    serializer_class = SecurityDepositSerializer
    filterset_fields = ['status', 'lease']
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        deposit = self.get_object()
        if deposit.status not in ('pending', 'held'):
            return Response({'error': f'Cannot receive funds while deposit is {deposit.status}.'},
                             status=status.HTTP_400_BAD_REQUEST)
        amount = request.data.get('amount')
        if not amount:
            return Response({'error': 'amount is required'}, status=status.HTTP_400_BAD_REQUEST)
        amount = Decimal(str(amount))

        deposit.amount_received += amount
        deposit.date_received = request.data.get('date_received') or datetime.date.today().isoformat()
        deposit.payment_reference = request.data.get('payment_reference', deposit.payment_reference)
        if deposit.amount_received >= deposit.amount_due:
            deposit.status = 'held'
        deposit.save()

        from accounting.models import Receipt
        Receipt.objects.create(
            source_type='trust_deposit', source_id=deposit.pk,
            payer_name=deposit.lease.tenant.get_full_name() or deposit.lease.tenant.username,
            amount=amount, payment_method=request.data.get('payment_method', ''),
            reference=deposit.payment_reference,
            description=f'Security deposit — {deposit.lease.property.name}',
            property=deposit.lease.property, received_date=deposit.date_received,
            issued_by=request.user,
        )
        return Response(SecurityDepositSerializer(deposit).data)

    @action(detail=True, methods=['post'], url_path='request-refund')
    def request_refund(self, request, pk=None):
        deposit = self.get_object()
        if deposit.status != 'held':
            return Response({'error': 'Deposit must be fully held before a refund can be requested.'},
                             status=status.HTTP_400_BAD_REQUEST)
        deposit.refund_amount = deposit.refundable_amount()
        deposit.requested_by = request.user
        deposit.requested_at = timezone.now()
        deposit.status = 'refund_requested'
        deposit.save()
        return Response(SecurityDepositSerializer(deposit).data)

    @action(detail=True, methods=['post'], url_path='approve-refund')
    def approve_refund(self, request, pk=None):
        # Deliberately a different actor from whoever requested it isn't enforced (small
        # teams often have the same person do both), but the role gate still applies —
        # only finance/admin can be the approver, matching every other refund/payout gate.
        if request.user.role not in ('admin', 'accountant', 'property_manager'):
            return Response({'error': 'Only admin, accountant or property manager can approve a deposit refund.'},
                             status=status.HTTP_403_FORBIDDEN)
        deposit = self.get_object()
        if deposit.status != 'refund_requested':
            return Response({'error': 'No pending refund request for this deposit.'},
                             status=status.HTTP_400_BAD_REQUEST)
        deposit.refund_method = request.data.get('refund_method', 'bank_transfer')
        deposit.refund_reference = request.data.get('refund_reference', '')
        deposit.refund_date = datetime.date.today()
        deposit.approved_by = request.user
        deposit.approved_at = timezone.now()
        deposit.status = 'forfeited' if deposit.refund_amount is not None and deposit.refund_amount <= 0 else 'refunded'
        deposit.save()

        from notifications.dispatch import notify
        notify(
            user=deposit.lease.tenant, notification_type='system', priority='normal',
            title='Security Deposit Refund Processed' if deposit.status == 'refunded' else 'Security Deposit Forfeited',
            message=(f'Your security deposit refund of ${deposit.refund_amount} for '
                     f'{deposit.lease.property.name} has been approved and processed via '
                     f'{deposit.get_refund_method_display()}.') if deposit.status == 'refunded' else
                    (f'Your security deposit for {deposit.lease.property.name} was fully applied '
                     f'to deductions — no refund is due.'),
            link='/leases',
        )
        return Response(SecurityDepositSerializer(deposit).data)


class DepositDeductionViewSet(viewsets.ModelViewSet):
    queryset = DepositDeduction.objects.select_related('deposit')
    serializer_class = DepositDeductionSerializer
    filterset_fields = ['deposit', 'category', 'is_suggested']

    def perform_create(self, serializer):
        deposit = serializer.validated_data['deposit']
        if deposit.status not in ('pending', 'held'):
            raise serializers.ValidationError(
                'Deductions can only be added while a deposit is pending or held, before a refund is requested.')
        serializer.save(created_by=self.request.user)
