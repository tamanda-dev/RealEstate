from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count, Avg
import datetime
from .models import Property, PropertyImage, Unit
from .serializers import PropertySerializer, PropertyListSerializer, PropertyImageSerializer, UnitSerializer


class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.select_related('owner', 'manager').prefetch_related('images', 'units')
    search_fields = ['name', 'address', 'city', 'state']
    filterset_fields = ['property_type', 'status', 'city', 'state', 'owner']
    ordering_fields = ['created_at', 'monthly_rent', 'current_value', 'square_feet']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in ('landlord', 'owner'):
            return qs.filter(owner=user)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return PropertyListSerializer
        return PropertySerializer

    @action(detail=True, methods=['get'])
    def units(self, request, pk=None):
        property_obj = self.get_object()
        units = property_obj.units.all()
        serializer = UnitSerializer(units, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        stats = {
            'total': Property.objects.count(),
            'available': Property.objects.filter(status='available').count(),
            'rented': Property.objects.filter(status='rented').count(),
            'for_sale': Property.objects.filter(status='listed_for_sale').count(),
            'under_maintenance': Property.objects.filter(status='under_maintenance').count(),
            'total_value': float(Property.objects.aggregate(v=Sum('current_value'))['v'] or 0),
            'avg_rent': float(Property.objects.aggregate(r=Avg('monthly_rent'))['r'] or 0),
            'total_units': Unit.objects.count(),
            'occupied_units': Unit.objects.filter(is_occupied=True).count(),
            'vacant_units': Unit.objects.filter(is_occupied=False).count(),
        }
        stats['occupancy_rate'] = (
            round(stats['occupied_units'] / stats['total_units'] * 100, 1)
            if stats['total_units'] else 0
        )
        return Response(stats)

    @action(detail=False, methods=['get'])
    def portfolio_analytics(self, request):
        from rent.models import Invoice
        from expenses.models import OperatingExpense

        current_year = datetime.date.today().year
        months_label = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

        by_type = list(
            Property.objects.values('property_type')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        total_units = Unit.objects.count()
        occupied_units = Unit.objects.filter(is_occupied=True).count()

        monthly_data = []
        for m in range(1, 13):
            revenue = float(
                Invoice.objects.filter(
                    period_start__year=current_year,
                    period_start__month=m,
                    status='paid'
                ).aggregate(t=Sum('paid_amount'))['t'] or 0
            )
            expenses = float(
                OperatingExpense.objects.filter(
                    expense_date__year=current_year,
                    expense_date__month=m,
                    status__in=['pending', 'paid']
                ).aggregate(t=Sum('amount'))['t'] or 0
            )
            monthly_data.append({
                'month': months_label[m - 1],
                'revenue': revenue,
                'expenses': expenses,
                'noi': revenue - expenses,
            })

        return Response({
            'by_type': by_type,
            'total_units': total_units,
            'occupied_units': occupied_units,
            'vacant_units': total_units - occupied_units,
            'occupancy_rate': round(occupied_units / total_units * 100, 1) if total_units else 0,
            'portfolio_value': float(Property.objects.aggregate(v=Sum('current_value'))['v'] or 0),
            'monthly_data': monthly_data,
            'year': current_year,
        })

    @action(detail=True, methods=['get'])
    def roi_analytics(self, request, pk=None):
        from rent.models import Invoice
        from expenses.models import OperatingExpense

        prop = self.get_object()
        current_year = datetime.date.today().year

        annual_revenue = float(
            Invoice.objects.filter(
                property=prop, status='paid',
                period_start__year=current_year
            ).aggregate(t=Sum('paid_amount'))['t'] or 0
        )
        annual_expenses = float(
            OperatingExpense.objects.filter(
                property=prop,
                status__in=['pending', 'paid'],
                expense_date__year=current_year
            ).aggregate(t=Sum('amount'))['t'] or 0
        )
        noi = annual_revenue - annual_expenses
        prop_value = float(prop.current_value or prop.purchase_price or 1)
        roi = round(noi / prop_value * 100, 2) if prop_value else 0
        gross_yield = round(
            float(prop.monthly_rent or 0) * 12 / prop_value * 100, 2
        ) if prop_value and prop.monthly_rent else 0

        return Response({
            'property_name': prop.name,
            'annual_revenue': annual_revenue,
            'annual_expenses': annual_expenses,
            'noi': noi,
            'property_value': prop_value,
            'roi': roi,
            'gross_yield': gross_yield,
            'monthly_rent': float(prop.monthly_rent or 0),
        })


class PropertyImageViewSet(viewsets.ModelViewSet):
    queryset = PropertyImage.objects.all()
    serializer_class = PropertyImageSerializer
    filterset_fields = ['property']


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.select_related('property')
    serializer_class = UnitSerializer
    filterset_fields = ['property', 'is_occupied']
    search_fields = ['unit_number']
