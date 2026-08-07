from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from dateutil.relativedelta import relativedelta
import datetime
from .models import Lease, LeaseClause, LeaseRenewal, RentReviewLog
from .serializers import (LeaseSerializer, LeaseClauseSerializer, LeaseRenewalSerializer,
                           RentReviewLogSerializer)


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
