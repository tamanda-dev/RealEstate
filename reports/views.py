from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Sum, Count, Avg, F, Q
import datetime
import calendar


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def aging_report(request):
    """Receivables aging: 0-30, 31-60, 61-90, 90+ days overdue."""
    from rent.models import Invoice
    today = datetime.date.today()

    def bucket(days_from, days_to):
        qs = Invoice.objects.filter(status__in=['overdue', 'partial', 'sent'])
        qs = qs.filter(due_date__lte=today - datetime.timedelta(days=days_from))
        if days_to is not None:
            qs = qs.filter(due_date__gt=today - datetime.timedelta(days=days_to))
        return {
            'count': qs.count(),
            'amount': float(qs.aggregate(t=Sum(F('total_amount') - F('paid_amount')))['t'] or 0),
        }

    property_id = request.query_params.get('property')
    invoices = Invoice.objects.filter(status__in=['overdue', 'partial', 'sent'])
    if property_id:
        invoices = invoices.filter(property_id=property_id)

    detail = []
    for inv in invoices.select_related('tenant', 'property'):
        days_overdue = (today - inv.due_date).days
        balance = float(inv.total_amount - inv.paid_amount)
        if balance > 0:
            detail.append({
                'invoice_number': inv.invoice_number,
                'tenant': inv.tenant.get_full_name(),
                'property': inv.property.name if inv.property else '',
                'due_date': str(inv.due_date),
                'days_overdue': days_overdue,
                'balance_usd': balance,
            })

    return Response({
        'generated_at': today.isoformat(),
        'buckets': {
            'current': bucket(-1, 0),   # not yet due
            '1_30_days': bucket(0, 30),
            '31_60_days': bucket(30, 60),
            '61_90_days': bucket(60, 90),
            '90_plus_days': bucket(90, None),
        },
        'detail': sorted(detail, key=lambda x: -x['days_overdue']),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pl_report(request):
    """Profit & Loss by property or portfolio for a given year/month."""
    from rent.models import Invoice
    from expenses.models import OperatingExpense
    from maintenance.models import WorkOrder

    year = int(request.query_params.get('year', datetime.date.today().year))
    month = request.query_params.get('month')
    property_id = request.query_params.get('property')

    inv_qs = Invoice.objects.filter(period_start__year=year, status='paid')
    exp_qs = OperatingExpense.objects.filter(expense_date__year=year, status__in=['paid', 'pending'])
    maint_qs = WorkOrder.objects.filter(created_at__year=year, status='completed')

    if month:
        inv_qs = inv_qs.filter(period_start__month=int(month))
        exp_qs = exp_qs.filter(expense_date__month=int(month))
        maint_qs = maint_qs.filter(created_at__month=int(month))

    if property_id:
        inv_qs = inv_qs.filter(property_id=property_id)
        exp_qs = exp_qs.filter(property_id=property_id)
        maint_qs = maint_qs.filter(property_id=property_id)

    revenue = float(inv_qs.aggregate(t=Sum('paid_amount'))['t'] or 0)
    op_expenses = float(exp_qs.aggregate(t=Sum('amount'))['t'] or 0)
    maintenance_cost = float(maint_qs.aggregate(t=Sum('actual_cost'))['t'] or 0)
    total_expenses = op_expenses + maintenance_cost
    noi = revenue - total_expenses

    expense_breakdown = list(
        exp_qs.values('category__name').annotate(total=Sum('amount')).order_by('-total')
    )

    return Response({
        'period': {'year': year, 'month': month},
        'revenue': revenue,
        'operating_expenses': op_expenses,
        'maintenance_cost': maintenance_cost,
        'total_expenses': total_expenses,
        'noi': noi,
        'profit_margin_pct': round(noi / revenue * 100, 1) if revenue else 0,
        'expense_breakdown': expense_breakdown,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def agent_performance(request):
    """Agent conversion rates, deals closed, pipeline value."""
    from crm.models import Lead, Opportunity

    agents = []
    from django.contrib.auth import get_user_model
    User = get_user_model()
    for user in User.objects.filter(role__in=['agent', 'manager']):
        total_leads = Lead.objects.filter(assigned_to=user).count()
        won = Lead.objects.filter(assigned_to=user, status='won').count()
        lost = Lead.objects.filter(assigned_to=user, status='lost').count()
        active_opps = Opportunity.objects.filter(assigned_to=user).exclude(
            stage__is_won=True).exclude(stage__is_lost=True)
        pipeline_value = float(active_opps.aggregate(t=Sum('expected_value_usd'))['t'] or 0)
        conversion_rate = round(won / total_leads * 100, 1) if total_leads else 0
        agents.append({
            'agent_id': user.pk,
            'name': user.get_full_name() or user.username,
            'role': user.role,
            'total_leads': total_leads,
            'won': won,
            'lost': lost,
            'active': total_leads - won - lost,
            'conversion_rate': conversion_rate,
            'pipeline_value_usd': pipeline_value,
        })
    agents.sort(key=lambda x: -x['conversion_rate'])
    return Response(agents)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cash_flow_forecast(request):
    """12-month rolling cash flow based on leases and known expenses."""
    from leases.models import Lease
    from expenses.models import OperatingExpense

    today = datetime.date.today()
    months = []
    for i in range(12):
        m = today.month + i
        y = today.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        label = datetime.date(y, m, 1).strftime('%b %Y')

        # Expected rental income from active leases
        active_leases = Lease.objects.filter(
            status='active', start_date__lte=datetime.date(y, m, 28),
            end_date__gte=datetime.date(y, m, 1)
        )
        expected_rent = float(active_leases.aggregate(t=Sum('monthly_rent'))['t'] or 0)

        # Recurring expenses (simplified: use average of last 3 months)
        avg_expenses = float(
            OperatingExpense.objects.filter(
                expense_date__gte=today - datetime.timedelta(days=90),
                is_recurring=True, status__in=['paid', 'pending']
            ).aggregate(t=Sum('amount'))['t'] or 0
        ) / 3

        months.append({
            'period': label,
            'year': y, 'month': m,
            'expected_income': expected_rent,
            'expected_expenses': round(avg_expenses, 2),
            'projected_noi': round(expected_rent - avg_expenses, 2),
        })

    return Response({'forecast': months, 'generated_at': today.isoformat()})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_report(request):
    """Property inventory: occupancy, vacancy, fast/slow movers."""
    from properties.models import Property, Unit
    from django.db.models import Count

    props = Property.objects.annotate(
        unit_count=Count('units'),
        occupied=Count('units', filter=Q(units__is_occupied=True)),
    ).values('id', 'name', 'city', 'property_type', 'status', 'unit_count',
             'occupied', 'monthly_rent', 'current_value')

    result = []
    for p in props:
        vacant = (p['unit_count'] or 1) - (p['occupied'] or 0)
        occ_rate = round((p['occupied'] or 0) / (p['unit_count'] or 1) * 100, 1)
        result.append({**p, 'vacant': vacant, 'occupancy_rate': occ_rate,
                       'monthly_rent': float(p['monthly_rent'] or 0),
                       'current_value': float(p['current_value'] or 0)})

    return Response({
        'properties': result,
        'summary': {
            'total_properties': len(result),
            'total_units': sum(p['unit_count'] or 0 for p in result),
            'total_occupied': sum(p['occupied'] or 0 for p in result),
            'total_vacant': sum(p['vacant'] for p in result),
            'avg_occupancy': round(sum(p['occupancy_rate'] for p in result) / len(result), 1) if result else 0,
        }
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tenant_ledger(request):
    """Running balance ledger for a specific tenant."""
    from rent.models import Invoice, Payment
    from django.contrib.auth import get_user_model
    User = get_user_model()

    tenant_id = request.query_params.get('tenant')
    if not tenant_id:
        return Response({'error': 'tenant param required'}, status=400)

    try:
        tenant = User.objects.get(pk=tenant_id)
    except User.DoesNotExist:
        return Response({'error': 'Tenant not found'}, status=404)

    entries = []
    balance = 0

    invoices = Invoice.objects.filter(tenant=tenant).order_by('period_start', 'created_at')
    for inv in invoices:
        balance += float(inv.total_amount)
        entries.append({
            'date': str(inv.period_start),
            'type': 'invoice',
            'description': f'Rent — {inv.invoice_number} ({calendar.month_abbr[inv.period_start.month]} {inv.period_start.year})',
            'debit': float(inv.total_amount),
            'credit': 0,
            'balance': balance,
            'reference': inv.invoice_number,
            'status': inv.status,
        })
        payments = Payment.objects.filter(invoice=inv).order_by('payment_date')
        for pay in payments:
            balance -= float(pay.amount)
            entries.append({
                'date': str(pay.payment_date),
                'type': 'payment',
                'description': f'Payment received — {pay.payment_method.replace("_"," ")}',
                'debit': 0,
                'credit': float(pay.amount),
                'balance': balance,
                'reference': pay.reference_number or inv.invoice_number,
                'status': 'paid',
            })

    return Response({
        'tenant_id': tenant.pk,
        'tenant_name': tenant.get_full_name(),
        'closing_balance': balance,
        'entries': sorted(entries, key=lambda x: x['date']),
        'total_invoiced': float(Invoice.objects.filter(tenant=tenant).aggregate(t=Sum('total_amount'))['t'] or 0),
        'total_paid': float(Invoice.objects.filter(tenant=tenant).aggregate(p=Sum('paid_amount'))['p'] or 0),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def landlord_ledger(request):
    """Running financial summary per landlord/owner."""
    from rent.models import Invoice
    from lettings.models import LandlordDisbursement
    from django.contrib.auth import get_user_model
    User = get_user_model()

    owner_id = request.query_params.get('owner')
    year = int(request.query_params.get('year', datetime.date.today().year))

    if not owner_id:
        return Response({'error': 'owner param required'}, status=400)

    try:
        owner = User.objects.get(pk=owner_id)
    except User.DoesNotExist:
        return Response({'error': 'Owner not found'}, status=404)

    from properties.models import Property
    props = Property.objects.filter(owner=owner)

    monthly = []
    for m in range(1, 13):
        gross = float(Invoice.objects.filter(
            property__in=props, period_start__year=year, period_start__month=m, status='paid'
        ).aggregate(t=Sum('paid_amount'))['t'] or 0)
        net = float(LandlordDisbursement.objects.filter(
            owner=owner, period_year=year, period_month=m
        ).aggregate(t=Sum('net_to_landlord_usd'))['t'] or 0)
        monthly.append({
            'month': calendar.month_abbr[m],
            'gross_rent': gross,
            'net_disbursed': net,
            'difference': gross - net,
        })

    annual_gross = sum(m['gross_rent'] for m in monthly)
    annual_net = sum(m['net_disbursed'] for m in monthly)

    return Response({
        'owner_id': owner.pk,
        'owner_name': owner.get_full_name(),
        'year': year,
        'properties': [{'id': p.pk, 'name': p.name, 'monthly_rent': float(p.monthly_rent or 0)} for p in props],
        'annual_gross_rent': annual_gross,
        'annual_net_disbursed': annual_net,
        'annual_deductions': annual_gross - annual_net,
        'monthly': monthly,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def vat_zimra_report(request):
    """VAT on commissions for ZIMRA remittance."""
    from lettings.models import LandlordDisbursement

    year = int(request.query_params.get('year', datetime.date.today().year))
    month = request.query_params.get('month')

    qs = LandlordDisbursement.objects.filter(period_year=year)
    if month:
        qs = qs.filter(period_month=int(month))

    total_commissions = float(qs.aggregate(t=Sum('agent_commission_usd'))['t'] or 0)
    total_vat = float(qs.aggregate(t=Sum('vat_on_commission_usd'))['t'] or 0)
    total_gross = float(qs.aggregate(t=Sum('gross_rent_usd'))['t'] or 0)

    monthly_vat = []
    for m in range(1, 13):
        row = qs.filter(period_month=m).aggregate(
            comm=Sum('agent_commission_usd'), vat=Sum('vat_on_commission_usd'))
        monthly_vat.append({
            'month': calendar.month_abbr[m],
            'commission': float(row['comm'] or 0),
            'vat_due': float(row['vat'] or 0),
        })

    return Response({
        'year': year,
        'month_filter': month,
        'total_gross_rent_managed': total_gross,
        'total_commissions_earned': total_commissions,
        'vat_rate_pct': 15.5,
        'total_vat_due': total_vat,
        'monthly_breakdown': monthly_vat,
        'zimra_note': 'VAT on commission income is due by the 25th of the following month.',
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def commission_trends(request):
    """Commission income trend analysis."""
    from lettings.models import LandlordDisbursement
    from sales.models import Transaction

    year = int(request.query_params.get('year', datetime.date.today().year))

    rental_monthly = []
    for m in range(1, 13):
        row = LandlordDisbursement.objects.filter(
            period_year=year, period_month=m
        ).aggregate(comm=Sum('agent_commission_usd'), vat=Sum('vat_on_commission_usd'))
        gross_comm = float(row['comm'] or 0)
        vat = float(row['vat'] or 0)
        rental_monthly.append({
            'month': calendar.month_abbr[m],
            'rental_commission': gross_comm,
            'vat_on_rental': vat,
            'net_rental_commission': gross_comm - vat,
        })

    sales_total = float(Transaction.objects.filter(
        closing_date__year=year
    ).aggregate(t=Sum('listing_agent_commission'))['t'] or 0)

    total_rental_commission = sum(m['rental_commission'] for m in rental_monthly)
    total_vat = sum(m['vat_on_rental'] for m in rental_monthly)

    return Response({
        'year': year,
        'rental_commission_gross': total_rental_commission,
        'rental_commission_vat': total_vat,
        'rental_commission_net': total_rental_commission - total_vat,
        'sales_commission': sales_total,
        'total_commission_income': (total_rental_commission - total_vat) + sales_total,
        'monthly': rental_monthly,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def rent_per_sqm_report(request):
    """Rental rate per sqm analysis across portfolio — critical for commercial/industrial pricing."""
    from properties.models import Property, Unit

    property_type = request.query_params.get('property_type')
    city = request.query_params.get('city')

    qs = Property.objects.filter(square_feet__gt=0, monthly_rent__gt=0)
    if property_type:
        qs = qs.filter(property_type=property_type)
    if city:
        qs = qs.filter(city__icontains=city)

    result = []
    for p in qs.select_related('owner'):
        rent_per_sqm = float(p.monthly_rent) / float(p.square_feet)
        result.append({
            'property_id': p.pk,
            'name': p.name,
            'city': p.city,
            'property_type': p.property_type,
            'status': p.status,
            'floor_area_sqm': float(p.square_feet),
            'monthly_rent_usd': float(p.monthly_rent),
            'rent_per_sqm_usd': round(rent_per_sqm, 2),
            'annual_rent_usd': float(p.monthly_rent) * 12,
            'current_value_usd': float(p.current_value or 0),
            'gross_yield_pct': round(float(p.monthly_rent) * 12 / float(p.current_value) * 100, 2)
                               if p.current_value else 0,
        })

    result.sort(key=lambda x: -x['rent_per_sqm_usd'])

    avg_per_sqm = sum(r['rent_per_sqm_usd'] for r in result) / len(result) if result else 0

    return Response({
        'properties': result,
        'summary': {
            'count': len(result),
            'avg_rent_per_sqm': round(avg_per_sqm, 2),
            'max_rent_per_sqm': max((r['rent_per_sqm_usd'] for r in result), default=0),
            'min_rent_per_sqm': min((r['rent_per_sqm_usd'] for r in result), default=0),
        }
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def market_price_analysis(request):
    """Compare listed property prices against sales comparables database."""
    from sales.models import Listing
    from valuation.models import SalesComparablesDB
    from django.db.models import Avg

    listings = Listing.objects.filter(status='active').select_related('property')
    result = []
    for listing in listings:
        prop = listing.property
        # Find matching comparables
        comps = SalesComparablesDB.objects.filter(
            city__icontains=prop.city,
            property_type=prop.property_type,
            sale_date__gte=datetime.date.today() - datetime.timedelta(days=365),
        )
        avg_market = comps.aggregate(a=Avg('sale_price_usd'))['a']
        pct_above = None
        position = 'unknown'
        if avg_market and float(avg_market) > 0:
            pct_above = round((float(listing.asking_price) - float(avg_market)) / float(avg_market) * 100, 1)
            if pct_above > 10:
                position = 'above_market'
            elif pct_above < -10:
                position = 'below_market'
            else:
                position = 'at_market'

        result.append({
            'listing_id': listing.pk,
            'property_name': prop.name,
            'city': prop.city,
            'property_type': prop.property_type,
            'asking_price_usd': float(listing.asking_price),
            'market_avg_usd': float(avg_market) if avg_market else None,
            'pct_vs_market': pct_above,
            'market_position': position,
            'comparables_count': comps.count(),
        })

    return Response({'listings': result, 'generated_at': datetime.date.today().isoformat()})
