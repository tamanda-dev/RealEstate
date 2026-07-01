from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count, Q
import datetime
import calendar
from .models import PropertyInspection, LandlordDisbursement
from .serializers import PropertyInspectionSerializer, LandlordDisbursementSerializer


class PropertyInspectionViewSet(viewsets.ModelViewSet):
    queryset = PropertyInspection.objects.select_related('property', 'unit', 'lease', 'inspector')
    serializer_class = PropertyInspectionSerializer
    filterset_fields = ['inspection_type', 'status', 'property', 'inspector', 'action_required']
    search_fields = ['property__name', 'report_summary']
    ordering_fields = ['scheduled_date', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        # Auto-mark overdue
        qs.filter(
            status='scheduled',
            scheduled_date__lt=datetime.date.today()
        ).update(status='overdue')
        return qs

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        days = int(request.query_params.get('days', 30))
        future = datetime.date.today() + datetime.timedelta(days=days)
        qs = PropertyInspection.objects.filter(
            status='scheduled',
            scheduled_date__gte=datetime.date.today(),
            scheduled_date__lte=future,
        )
        return Response(PropertyInspectionSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        today = datetime.date.today()
        return Response({
            'total': PropertyInspection.objects.count(),
            'scheduled': PropertyInspection.objects.filter(status='scheduled', scheduled_date__gte=today).count(),
            'overdue': PropertyInspection.objects.filter(
                status__in=['scheduled', 'overdue'], scheduled_date__lt=today).count(),
            'completed': PropertyInspection.objects.filter(status='completed').count(),
            'action_required': PropertyInspection.objects.filter(action_required=True, status='completed').count(),
            'due_this_week': PropertyInspection.objects.filter(
                status='scheduled',
                scheduled_date__gte=today,
                scheduled_date__lte=today + datetime.timedelta(days=7),
            ).count(),
        })

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        inspection = self.get_object()
        inspection.status = 'completed'
        inspection.actual_date = request.data.get('actual_date', datetime.date.today().isoformat())
        inspection.overall_condition = request.data.get('overall_condition', 'good')
        inspection.report_summary = request.data.get('report_summary', '')
        inspection.action_required = request.data.get('action_required', False)
        inspection.action_description = request.data.get('action_description', '')
        next_date = request.data.get('next_inspection_date')
        if next_date:
            inspection.next_inspection_date = next_date
        inspection.save()
        return Response(PropertyInspectionSerializer(inspection).data)


class LandlordDisbursementViewSet(viewsets.ModelViewSet):
    queryset = LandlordDisbursement.objects.select_related('property', 'owner', 'exchange_rate')
    serializer_class = LandlordDisbursementSerializer
    filterset_fields = ['status', 'property', 'owner', 'period_year', 'period_month']
    ordering_fields = ['-period_year', '-period_month']

    def perform_create(self, serializer):
        from currency.models import ExchangeRate
        rate = ExchangeRate.get_latest()
        serializer.save(generated_by=self.request.user, exchange_rate=rate)

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """Auto-generate disbursement from actual rent collected for a property+period."""
        from rent.models import Invoice
        from currency.models import ExchangeRate
        property_id = request.data.get('property_id')
        month = int(request.data.get('month', datetime.date.today().month))
        year = int(request.data.get('year', datetime.date.today().year))
        commission_rate = float(request.data.get('agent_commission_rate', 10))

        from properties.models import Property
        try:
            prop = Property.objects.get(pk=property_id)
        except Property.DoesNotExist:
            return Response({'error': 'Property not found'}, status=status.HTTP_404_NOT_FOUND)

        gross = float(Invoice.objects.filter(
            property=prop,
            period_start__year=year,
            period_start__month=month,
            status__in=['paid', 'partial'],
        ).aggregate(t=Sum('paid_amount'))['t'] or 0)

        # Auto-deduct completed maintenance costs
        from maintenance.models import WorkOrder
        repairs = float(WorkOrder.objects.filter(
            property=prop,
            status='completed',
            completed_date__year=year,
            completed_date__month=month,
        ).aggregate(t=Sum('actual_cost'))['t'] or 0)

        rate = ExchangeRate.get_latest()
        disb, created = LandlordDisbursement.objects.update_or_create(
            property=prop,
            period_month=month,
            period_year=year,
            defaults=dict(
                owner=prop.owner or request.user,
                gross_rent_usd=gross,
                agent_commission_rate=commission_rate,
                repairs_deducted_usd=repairs,
                exchange_rate=rate,
                generated_by=request.user,
            )
        )
        return Response(LandlordDisbursementSerializer(disb).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        disb = self.get_object()
        disb.status = 'paid'
        disb.paid_date = request.data.get('paid_date', datetime.date.today().isoformat())
        disb.payment_method = request.data.get('payment_method', '')
        disb.payment_reference = request.data.get('payment_reference', '')
        disb.save()
        return Response(LandlordDisbursementSerializer(disb).data)

    @action(detail=False, methods=['get'])
    def landlord_annual_statement(self, request):
        """Annual summary per landlord for financial reporting."""
        owner_id = request.query_params.get('owner')
        year = int(request.query_params.get('year', datetime.date.today().year))
        qs = LandlordDisbursement.objects.filter(period_year=year)
        if owner_id:
            qs = qs.filter(owner_id=owner_id)

        summary = qs.aggregate(
            total_gross=Sum('gross_rent_usd'),
            total_commission=Sum('agent_commission_usd'),
            total_vat=Sum('vat_on_commission_usd'),
            total_repairs=Sum('repairs_deducted_usd'),
            total_net=Sum('net_to_landlord_usd'),
        )
        monthly = []
        for m in range(1, 13):
            row = qs.filter(period_month=m).aggregate(
                gross=Sum('gross_rent_usd'), net=Sum('net_to_landlord_usd'))
            monthly.append({
                'month': calendar.month_abbr[m],
                'gross': float(row['gross'] or 0),
                'net': float(row['net'] or 0),
            })
        return Response({
            'year': year,
            'summary': {k: float(v or 0) for k, v in summary.items()},
            'monthly': monthly,
            'disbursements': LandlordDisbursementSerializer(qs, many=True).data,
        })
