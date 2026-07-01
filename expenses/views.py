from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count, Q
import datetime
from .models import ExpenseCategory, OperatingExpense, ExpenseBudget
from .serializers import ExpenseCategorySerializer, OperatingExpenseSerializer, ExpenseBudgetSerializer


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    filterset_fields = ['category_type', 'is_active', 'is_tax_deductible']
    search_fields = ['name', 'description']


class OperatingExpenseViewSet(viewsets.ModelViewSet):
    queryset = OperatingExpense.objects.select_related(
        'property', 'unit', 'category', 'created_by')
    serializer_class = OperatingExpenseSerializer
    filterset_fields = ['property', 'category', 'status', 'is_recurring', 'recurrence']
    search_fields = ['description', 'vendor_name', 'reference_number']
    ordering_fields = ['expense_date', 'amount', 'created_at']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        expense = self.get_object()
        expense.status = 'paid'
        expense.paid_date = request.data.get('paid_date', datetime.date.today().isoformat())
        expense.payment_method = request.data.get('payment_method', '')
        expense.reference_number = request.data.get('reference_number', '')
        expense.save()
        return Response(OperatingExpenseSerializer(expense).data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        today = datetime.date.today()
        this_month_start = today.replace(day=1)
        this_year_start = today.replace(month=1, day=1)

        qs = OperatingExpense.objects.filter(status__in=['pending', 'paid'])

        stats = {
            'total_this_month': qs.filter(
                expense_date__gte=this_month_start
            ).aggregate(t=Sum('amount'))['t'] or 0,
            'total_this_year': qs.filter(
                expense_date__gte=this_year_start
            ).aggregate(t=Sum('amount'))['t'] or 0,
            'pending_count': OperatingExpense.objects.filter(status='pending').count(),
            'pending_amount': OperatingExpense.objects.filter(
                status='pending').aggregate(t=Sum('amount'))['t'] or 0,
            'overdue_count': OperatingExpense.objects.filter(
                status='pending', due_date__lt=today).count(),
            'recurring_count': OperatingExpense.objects.filter(is_recurring=True).count(),
        }
        return Response(stats)

    @action(detail=False, methods=['get'])
    def by_category(self, request):
        year = int(request.query_params.get('year', datetime.date.today().year))
        month = request.query_params.get('month')
        property_id = request.query_params.get('property')

        qs = OperatingExpense.objects.filter(
            expense_date__year=year,
            status__in=['pending', 'paid'],
        )
        if month:
            qs = qs.filter(expense_date__month=int(month))
        if property_id:
            qs = qs.filter(property_id=property_id)

        data = (
            qs.values('category__name', 'category__category_type')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        )
        return Response(list(data))

    @action(detail=False, methods=['get'])
    def monthly_trend(self, request):
        property_id = request.query_params.get('property')
        year = int(request.query_params.get('year', datetime.date.today().year))

        qs = OperatingExpense.objects.filter(
            expense_date__year=year,
            status__in=['pending', 'paid'],
        )
        if property_id:
            qs = qs.filter(property_id=property_id)

        data = (
            qs.values('expense_date__month')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('expense_date__month')
        )
        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        result = [{'month': months[i], 'total': 0, 'count': 0} for i in range(12)]
        for row in data:
            idx = row['expense_date__month'] - 1
            result[idx]['total'] = float(row['total'])
            result[idx]['count'] = row['count']
        return Response(result)


class ExpenseBudgetViewSet(viewsets.ModelViewSet):
    queryset = ExpenseBudget.objects.select_related('property', 'category')
    serializer_class = ExpenseBudgetSerializer
    filterset_fields = ['property', 'category', 'year', 'month']
    ordering_fields = ['year', 'month']

    @action(detail=False, methods=['get'])
    def vs_actual(self, request):
        year = int(request.query_params.get('year', datetime.date.today().year))
        property_id = request.query_params.get('property')

        qs = ExpenseBudget.objects.filter(year=year).select_related('property', 'category')
        if property_id:
            qs = qs.filter(property_id=property_id)

        serializer = ExpenseBudgetSerializer(qs, many=True)
        return Response(serializer.data)
