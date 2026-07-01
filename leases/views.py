from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
import datetime
from .models import Lease, LeaseClause, LeaseRenewal
from .serializers import LeaseSerializer, LeaseClauseSerializer, LeaseRenewalSerializer


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


class LeaseRenewalViewSet(viewsets.ModelViewSet):
    queryset = LeaseRenewal.objects.select_related('lease')
    serializer_class = LeaseRenewalSerializer
    filterset_fields = ['lease', 'status']
