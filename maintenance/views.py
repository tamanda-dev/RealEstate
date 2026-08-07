from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q
from .models import Vendor, WorkOrder, MaintenanceExpense, PreventiveSchedule, ApprovedContractor
from .serializers import (VendorSerializer, WorkOrderSerializer, MaintenanceExpenseSerializer,
                           PreventiveScheduleSerializer, ApprovedContractorSerializer)


class PreventiveScheduleViewSet(viewsets.ModelViewSet):
    queryset = PreventiveSchedule.objects.select_related('property', 'vendor')
    serializer_class = PreventiveScheduleSerializer
    filterset_fields = ['property', 'category', 'frequency', 'is_active', 'vendor']
    search_fields = ['task_name', 'description']
    ordering_fields = ['next_due', 'created_at']

    @action(detail=False, methods=['get'])
    def due_soon(self, request):
        import datetime
        days = int(request.query_params.get('days', 30))
        future = datetime.date.today() + datetime.timedelta(days=days)
        qs = self.get_queryset().filter(
            is_active=True,
            next_due__lte=future,
        )
        return Response(PreventiveScheduleSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def mark_completed(self, request, pk=None):
        import datetime
        schedule = self.get_object()
        schedule.last_completed = request.data.get('completed_date', datetime.date.today().isoformat())
        schedule.next_due = schedule.calculate_next_due()
        schedule.save()
        if schedule.auto_create_work_order:
            WorkOrder.objects.create(
                property=schedule.property,
                title=f'[Preventive] {schedule.task_name}',
                description=schedule.description or schedule.task_name,
                category='other',
                priority='low',
                status='open',
                vendor=schedule.vendor,
                estimated_cost=schedule.estimated_cost_usd,
            )
        return Response(PreventiveScheduleSerializer(schedule).data)


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'contact_name', 'phone', 'email']
    ordering_fields = ['name', 'rating']


class ApprovedContractorViewSet(viewsets.ModelViewSet):
    """Contractor Management: lets a landlord/owner curate which Vendors are approved to
    work on their properties. Landlords only ever see/manage their own approvals; staff
    (admin/property_manager/manager) can see and manage approvals for any landlord."""
    serializer_class = ApprovedContractorSerializer
    filterset_fields = ['vendor', 'property', 'is_active']

    def get_queryset(self):
        qs = ApprovedContractor.objects.select_related('vendor', 'property', 'landlord')
        user = self.request.user
        if user.role in ('admin', 'property_manager', 'manager'):
            landlord_id = self.request.query_params.get('landlord')
            return qs.filter(landlord_id=landlord_id) if landlord_id else qs
        return qs.filter(landlord=user)

    def perform_create(self, serializer):
        serializer.save(landlord=self.request.user)

    @action(detail=False, methods=['get'])
    def available_vendors(self, request):
        """Active vendors not yet approved by this landlord for the given property (or at all)."""
        property_id = request.query_params.get('property')
        approved_vendor_ids = ApprovedContractor.objects.filter(
            landlord=request.user, is_active=True
        ).filter(Q(property_id=property_id) | Q(property__isnull=True)).values_list('vendor_id', flat=True)
        vendors = Vendor.objects.filter(is_active=True).exclude(pk__in=approved_vendor_ids)
        return Response(VendorSerializer(vendors, many=True).data)


class WorkOrderViewSet(viewsets.ModelViewSet):
    queryset = WorkOrder.objects.select_related('property', 'vendor', 'reported_by', 'assigned_to')
    serializer_class = WorkOrderSerializer
    filterset_fields = ['status', 'priority', 'category', 'property', 'vendor']
    search_fields = ['title', 'description']
    ordering_fields = ['created_at', 'priority', 'scheduled_date']

    @action(detail=True, methods=['post'])
    def dispatch_vendor(self, request, pk=None):
        work_order = self.get_object()
        # Accept both 'vendor' (frontend) and 'vendor_id' (legacy) field names
        vendor_id = request.data.get('vendor') or request.data.get('vendor_id')
        scheduled_date = request.data.get('scheduled_date')
        if not vendor_id:
            return Response({'error': 'vendor is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            vendor = Vendor.objects.get(pk=vendor_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)

        # Contractor Management: if the landlord has curated an approved-contractor list for
        # this property (or a portfolio-wide one), respect it — unless it's an emergency work
        # order, where blocking dispatch over an approval list would be actively harmful.
        # Properties/landlords who haven't engaged with the feature at all (no approvals on
        # file) are unaffected, so this doesn't break existing workflows.
        owner_id = work_order.property.owner_id
        landlord_has_curated_list = owner_id and ApprovedContractor.objects.filter(
            landlord_id=owner_id, is_active=True
        ).filter(Q(property=work_order.property) | Q(property__isnull=True)).exists()

        if landlord_has_curated_list and work_order.priority != 'emergency':
            is_approved = ApprovedContractor.objects.filter(
                vendor=vendor, landlord_id=owner_id, is_active=True
            ).filter(Q(property=work_order.property) | Q(property__isnull=True)).exists()
            if not is_approved:
                return Response(
                    {'error': f'"{vendor.name}" is not on the landlord\'s approved contractor '
                              f'list for this property. Ask the landlord to approve them first, '
                              f'or choose an approved contractor.'},
                    status=status.HTTP_400_BAD_REQUEST)

        work_order.vendor = vendor
        work_order.scheduled_date = scheduled_date
        work_order.status = 'assigned'
        work_order.save()
        return Response(WorkOrderSerializer(work_order).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        import datetime
        work_order = self.get_object()
        work_order.status = 'completed'
        work_order.completed_date = datetime.date.today()
        work_order.actual_cost = request.data.get('actual_cost', work_order.estimated_cost)
        # Accept 'completion_notes' (frontend) and 'notes' (legacy)
        notes = request.data.get('completion_notes') or request.data.get('notes', work_order.notes)
        work_order.notes = notes
        work_order.save()
        return Response(WorkOrderSerializer(work_order).data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        stats = {
            'open': WorkOrder.objects.filter(status='open').count(),
            'in_progress': WorkOrder.objects.filter(status='in_progress').count(),
            'assigned': WorkOrder.objects.filter(status='assigned').count(),
            'completed': WorkOrder.objects.filter(status='completed').count(),
            'emergency': WorkOrder.objects.filter(
                priority='emergency', status__in=['open', 'assigned', 'in_progress']).count(),
            'total_cost': WorkOrder.objects.aggregate(c=Sum('actual_cost'))['c'] or 0,
        }
        return Response(stats)


class MaintenanceExpenseViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceExpense.objects.select_related('work_order', 'vendor')
    serializer_class = MaintenanceExpenseSerializer
    filterset_fields = ['work_order', 'vendor']
    ordering_fields = ['expense_date', 'amount']
