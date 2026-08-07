from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Sum, Count, Q
from django.utils import timezone
import datetime
import calendar
from .models import (PropertyInspection, InspectionChecklistItem, LandlordDisbursement,
                      BulkPaymentBatch, BulkPaymentItem)
from .serializers import (PropertyInspectionSerializer, InspectionChecklistItemSerializer,
                           LandlordDisbursementSerializer, BulkPaymentBatchSerializer)


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
        inspection.report_summary = request.data.get('report_summary', '')
        inspection.action_required = request.data.get('action_required', False)
        inspection.action_description = request.data.get('action_description', '')
        next_date = request.data.get('next_inspection_date')
        if next_date:
            inspection.next_inspection_date = next_date
        # Automated scoring: if the digital sheet has rated checklist items, derive the
        # overall condition from them; otherwise fall back to the inspector's manual pick.
        inspection.recalculate_score()
        if inspection.condition_score is None:
            inspection.overall_condition = request.data.get('overall_condition', 'good')
        inspection.save()
        return Response(PropertyInspectionSerializer(inspection).data)

    @action(detail=True, methods=['post'], url_path='checklist-items')
    def add_checklist_item(self, request, pk=None):
        inspection = self.get_object()
        serializer = InspectionChecklistItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(inspection=inspection)
        inspection.recalculate_score()
        inspection.save(update_fields=['condition_score', 'overall_condition'])
        return Response(PropertyInspectionSerializer(inspection).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-report')
    def generate_report(self, request, pk=None):
        """Structured inspection report: checklist grouped by category, automated score,
        and a flagged action-items list — ready for the frontend to render or print."""
        inspection = self.get_object()
        items = inspection.checklist_items.all()
        by_category = {}
        for item in items:
            by_category.setdefault(item.category, []).append(InspectionChecklistItemSerializer(item).data)

        return Response({
            'inspection': PropertyInspectionSerializer(inspection).data,
            'property_name': inspection.property.name,
            'checklist_by_category': by_category,
            'condition_score': float(inspection.condition_score) if inspection.condition_score is not None else None,
            'overall_condition': inspection.overall_condition,
            'action_items': InspectionChecklistItemSerializer(
                items.filter(requires_action=True), many=True).data,
            'generated_at': datetime.date.today().isoformat(),
        })


class InspectionChecklistItemViewSet(viewsets.ModelViewSet):
    """Standalone CRUD for individual checklist line items (edit/delete a single item);
    use PropertyInspectionViewSet.add_checklist_item to add new ones so the parent's
    automated score stays in sync on create."""
    queryset = InspectionChecklistItem.objects.select_related('inspection')
    serializer_class = InspectionChecklistItemSerializer
    filterset_fields = ['inspection', 'category', 'condition', 'requires_action']

    def perform_update(self, serializer):
        item = serializer.save()
        item.inspection.recalculate_score()
        item.inspection.save(update_fields=['condition_score', 'overall_condition'])

    def perform_destroy(self, instance):
        inspection = instance.inspection
        instance.delete()
        inspection.recalculate_score()
        inspection.save(update_fields=['condition_score', 'overall_condition'])


class DisbursementOwnerMissing(Exception):
    """Raised instead of silently attributing a disbursement to whoever triggered it —
    a property with no owner on file is a data problem that needs fixing at the source,
    not money quietly routed to the wrong person."""
    pass


def generate_landlord_disbursement(prop, month, year, commission_rate, generated_by):
    """Auto-distribution: compute (or recompute) a property's landlord disbursement from
    actual rent collected for a period, net of agent commission/VAT and completed repair
    costs. Shared by LandlordDisbursementViewSet.generate (manual trigger) and
    rent's record_payment (automatic trigger via RecurringInvoiceProfile.auto_generate_disbursement).

    Raises DisbursementOwnerMissing if the property has no owner on file — callers must
    handle this and surface it, rather than letting the disbursement silently go to
    whoever happened to trigger generation."""
    from rent.models import Invoice
    from currency.models import ExchangeRate
    from maintenance.models import WorkOrder

    if not prop.owner_id:
        raise DisbursementOwnerMissing(
            f'Property "{prop.name}" (#{prop.pk}) has no owner on file. '
            f'Set Property.owner before generating a landlord disbursement for it.'
        )

    gross = float(Invoice.objects.filter(
        property=prop,
        period_start__year=year,
        period_start__month=month,
        status__in=['paid', 'partial'],
    ).aggregate(t=Sum('paid_amount'))['t'] or 0)

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
            owner=prop.owner,
            gross_rent_usd=gross,
            agent_commission_rate=commission_rate,
            repairs_deducted_usd=repairs,
            exchange_rate=rate,
            generated_by=generated_by,
        )
    )
    return disb, created


class LandlordDisbursementViewSet(viewsets.ModelViewSet):
    queryset = LandlordDisbursement.objects.select_related('property', 'owner', 'exchange_rate')
    serializer_class = LandlordDisbursementSerializer
    filterset_fields = ['status', 'property', 'owner', 'period_year', 'period_month']
    ordering_fields = ['period_year', 'period_month']

    def perform_create(self, serializer):
        from currency.models import ExchangeRate
        rate = ExchangeRate.get_latest()
        serializer.save(generated_by=self.request.user, exchange_rate=rate)

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """Auto-generate disbursement from actual rent collected for a property+period."""
        property_id = request.data.get('property_id')
        month = int(request.data.get('month', datetime.date.today().month))
        year = int(request.data.get('year', datetime.date.today().year))
        commission_rate = float(request.data.get('agent_commission_rate', 10))

        from properties.models import Property
        try:
            prop = Property.objects.get(pk=property_id)
        except Property.DoesNotExist:
            return Response({'error': 'Property not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            disb, created = generate_landlord_disbursement(prop, month, year, commission_rate, request.user)
        except DisbursementOwnerMissing as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
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


def execute_bulk_payment_batch(batch):
    """Process every pending item in a batch: mark each approved disbursement as paid.
    Shared by BulkPaymentBatchViewSet.execute (manual/immediate run) and the
    process_scheduled_bulk_payments management command (cron-triggered scheduled run)."""
    if batch.status not in ('draft', 'scheduled'):
        return {'error': f'Batch is already {batch.status}; cannot execute again.'}

    batch.status = 'processing'
    batch.save(update_fields=['status'])

    paid_count = 0
    failed_count = 0
    with transaction.atomic():
        for item in batch.items.select_related('disbursement').filter(status='pending'):
            disb = item.disbursement
            if disb.status != 'approved':
                item.status = 'failed'
                item.failure_reason = f'Disbursement status is "{disb.status}", expected "approved".'
                item.save(update_fields=['status', 'failure_reason'])
                failed_count += 1
                continue
            disb.status = 'paid'
            disb.paid_date = batch.scheduled_date
            disb.payment_method = batch.payment_method or disb.payment_method
            disb.payment_reference = (
                f"{batch.payment_reference_prefix or batch.name}-{item.pk}"
            )
            disb.save(update_fields=['status', 'paid_date', 'payment_method', 'payment_reference'])
            item.status = 'paid'
            item.save(update_fields=['status'])
            paid_count += 1

        batch.status = 'failed' if failed_count and not paid_count else 'completed'
        batch.executed_at = timezone.now()
        batch.save(update_fields=['status', 'executed_at'])

    return {'batch_status': batch.status, 'paid_count': paid_count, 'failed_count': failed_count}


class BulkPaymentBatchViewSet(viewsets.ModelViewSet):
    """Bulk Payments Engine: queue a batch of approved landlord disbursements and either
    execute them immediately or schedule them for a future date (e.g. 'pay all landlords
    on the 15th') — scheduled batches are picked up by the process_scheduled_bulk_payments
    management command, intended to be run daily by an external scheduler (cron / Task Scheduler)."""
    queryset = BulkPaymentBatch.objects.select_related('created_by').prefetch_related(
        'items__disbursement__property', 'items__disbursement__owner')
    serializer_class = BulkPaymentBatchSerializer
    filterset_fields = ['status']
    ordering_fields = ['scheduled_date', 'created_at']

    def create(self, request, *args, **kwargs):
        disbursement_ids = request.data.get('disbursement_ids', [])
        if not disbursement_ids:
            return Response({'error': 'disbursement_ids is required'}, status=status.HTTP_400_BAD_REQUEST)

        disbursements = LandlordDisbursement.objects.filter(pk__in=disbursement_ids, status='approved')
        found_ids = set(disbursements.values_list('pk', flat=True))
        missing = set(int(i) for i in disbursement_ids) - found_ids
        if missing:
            return Response(
                {'error': f'Disbursements not found or not in "approved" status: {sorted(missing)}'},
                status=status.HTTP_400_BAD_REQUEST)

        scheduled_date = request.data.get('scheduled_date')
        if not scheduled_date:
            return Response({'error': 'scheduled_date is required'}, status=status.HTTP_400_BAD_REQUEST)
        is_immediate = scheduled_date <= datetime.date.today().isoformat()

        with transaction.atomic():
            batch = BulkPaymentBatch.objects.create(
                name=request.data.get('name') or f"Landlord payment run — {scheduled_date}",
                scheduled_date=scheduled_date,
                payment_method=request.data.get('payment_method', ''),
                payment_reference_prefix=request.data.get('payment_reference_prefix', ''),
                notes=request.data.get('notes', ''),
                status='draft' if is_immediate else 'scheduled',
                created_by=request.user,
            )
            BulkPaymentItem.objects.bulk_create([
                BulkPaymentItem(batch=batch, disbursement=d, amount_usd=d.net_to_landlord_usd)
                for d in disbursements
            ])

        return Response(BulkPaymentBatchSerializer(batch).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        batch = self.get_object()
        result = execute_bulk_payment_batch(batch)
        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        # Re-fetch: execute_bulk_payment_batch updated items via separate queries, so the
        # prefetch cache captured by get_object() above is now stale.
        batch = self.get_queryset().get(pk=batch.pk)
        return Response({**result, 'batch': BulkPaymentBatchSerializer(batch).data})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        batch = self.get_object()
        if batch.status in ('completed', 'processing'):
            return Response({'error': f'Cannot cancel a batch that is {batch.status}.'},
                             status=status.HTTP_400_BAD_REQUEST)
        batch.status = 'cancelled'
        batch.save(update_fields=['status'])
        return Response(BulkPaymentBatchSerializer(batch).data)
