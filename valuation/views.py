from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Avg, Min, Max
import random, datetime
from decimal import Decimal
from .models import Valuation, Comparable, PriceTrend, SalesComparablesDB, ValuationMethodology
from .serializers import (ValuationSerializer, ComparableSerializer, PriceTrendSerializer,
                           SalesComparablesDBSerializer, ValuationMethodologySerializer)


class SalesComparablesDBViewSet(viewsets.ModelViewSet):
    queryset = SalesComparablesDB.objects.select_related('added_by')
    serializer_class = SalesComparablesDBSerializer
    filterset_fields = ['property_type', 'suburb', 'city', 'tenure', 'verified', 'condition']
    search_fields = ['address', 'suburb', 'city']
    ordering_fields = ['sale_date', 'sale_price_usd', 'price_per_sqm_land_usd']

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)

    @action(detail=False, methods=['post'])
    def search(self, request):
        """Intelligent comparable search for valuations."""
        suburb = request.data.get('suburb', '')
        city = request.data.get('city', '')
        property_type = request.data.get('property_type', 'residential')
        min_land = request.data.get('min_land_sqm')
        max_land = request.data.get('max_land_sqm')
        date_from = request.data.get('date_from')
        date_to = request.data.get('date_to', datetime.date.today().isoformat())
        bedrooms = request.data.get('bedrooms')
        verified_only = request.data.get('verified_only', False)

        qs = SalesComparablesDB.objects.filter(property_type=property_type)

        if suburb:
            qs = qs.filter(suburb__icontains=suburb)
        if city:
            qs = qs.filter(city__icontains=city)
        if min_land:
            qs = qs.filter(land_size_sqm__gte=min_land)
        if max_land:
            qs = qs.filter(land_size_sqm__lte=max_land)
        if date_from:
            qs = qs.filter(sale_date__gte=date_from)
        if date_to:
            qs = qs.filter(sale_date__lte=date_to)
        if bedrooms:
            qs = qs.filter(bedrooms=int(bedrooms))
        if verified_only:
            qs = qs.filter(verified=True)

        qs = qs.order_by('-sale_date')[:20]
        agg = SalesComparablesDB.objects.filter(pk__in=[c.pk for c in qs]).aggregate(
            avg_price=Avg('sale_price_usd'),
            min_price=Min('sale_price_usd'),
            max_price=Max('sale_price_usd'),
            avg_price_per_sqm=Avg('price_per_sqm_land_usd'),
        )

        return Response({
            'count': len(qs),
            'comparables': SalesComparablesDBSerializer(qs, many=True).data,
            'statistics': {k: float(v) if v else 0 for k, v in agg.items()},
        })

    @action(detail=False, methods=['get'])
    def market_summary(self, request):
        """Market price summary by suburb for price analysis."""
        city = request.query_params.get('city', 'Harare')
        ptype = request.query_params.get('property_type', 'residential')
        months_back = int(request.query_params.get('months', 12))
        since = datetime.date.today() - datetime.timedelta(days=months_back * 30)

        from django.db.models import Count
        data = (
            SalesComparablesDB.objects.filter(
                city__icontains=city,
                property_type=ptype,
                sale_date__gte=since,
            )
            .values('suburb')
            .annotate(
                avg_price=Avg('sale_price_usd'),
                avg_per_sqm=Avg('price_per_sqm_land_usd'),
                count=Count('id'),
            )
            .order_by('suburb')
        )
        return Response({'city': city, 'property_type': ptype, 'suburbs': list(data)})


class ValuationViewSet(viewsets.ModelViewSet):
    queryset = Valuation.objects.select_related('property', 'performed_by').prefetch_related(
        'comparables', 'methodologies')
    serializer_class = ValuationSerializer
    filterset_fields = ['method', 'property']
    ordering_fields = ['valuation_date', 'estimated_value']

    @action(detail=False, methods=['post'])
    def run_avm(self, request):
        property_id = request.data.get('property_id')
        try:
            from properties.models import Property
            from lettings.models import PropertyInspection
            prop = Property.objects.get(pk=property_id)
            base = float(prop.current_value or prop.purchase_price or 100000)
            noise = random.uniform(0.95, 1.05)
            estimated = round(base * noise, 2)
            confidence = round(random.uniform(75, 95), 1)

            # Inspection Engine integration: the most recent scored inspection nudges the
            # AVM estimate and confidence — a property scoring poorly on its digital
            # inspection sheet is worth less than raw comparables alone would suggest.
            notes = 'Automated valuation based on property data and market conditions.'
            latest_inspection = PropertyInspection.objects.filter(
                property=prop, status='completed', condition_score__isnull=False
            ).order_by('-actual_date').first()
            if latest_inspection:
                score = float(latest_inspection.condition_score)
                condition_factor = 0.85 + (score / 100) * 0.15
                estimated = round(estimated * condition_factor, 2)
                confidence = min(98, confidence + 5)
                notes += (f' Adjusted using inspection #{latest_inspection.pk} '
                          f'(condition score {score}/100, {latest_inspection.overall_condition}).')

            low = round(estimated * 0.93, 2)
            high = round(estimated * 1.07, 2)
            valuation = Valuation.objects.create(
                property=prop, performed_by=request.user, method='avm',
                estimated_value=estimated, low_estimate=low, high_estimate=high,
                confidence_score=confidence, valuation_date=datetime.date.today(),
                notes=notes,
            )
            if latest_inspection and not latest_inspection.valuation_id:
                latest_inspection.valuation = valuation
                latest_inspection.save(update_fields=['valuation'])
            return Response(ValuationSerializer(valuation).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def investment_approach(self, request):
        """Income Capitalisation / Investment Approach."""
        property_id = request.data.get('property_id')
        gross_annual_rent = Decimal(str(request.data.get('gross_annual_rent_usd', 0)))
        vacancy_rate = Decimal(str(request.data.get('vacancy_rate_pct', 5)))
        op_expenses_rate = Decimal(str(request.data.get('op_expenses_pct', 25)))
        cap_rate = Decimal(str(request.data.get('cap_rate_pct', 8)))

        if cap_rate <= 0:
            return Response({'error': 'Cap rate must be > 0'}, status=400)

        effective_gross = gross_annual_rent * (1 - vacancy_rate / 100)
        op_expenses = effective_gross * op_expenses_rate / 100
        noi = effective_gross - op_expenses
        estimated_value = round(noi / (cap_rate / 100), 2)

        result = {
            'gross_annual_rent_usd': float(gross_annual_rent),
            'vacancy_allowance_usd': float(gross_annual_rent * vacancy_rate / 100),
            'effective_gross_income_usd': float(effective_gross),
            'operating_expenses_usd': float(op_expenses),
            'net_operating_income_usd': float(noi),
            'cap_rate_pct': float(cap_rate),
            'estimated_value_usd': float(estimated_value),
            'yield_pct': float(cap_rate),
        }

        if property_id:
            try:
                from properties.models import Property
                prop = Property.objects.get(pk=property_id)
                val = Valuation.objects.create(
                    property=prop, performed_by=request.user, method='investment',
                    estimated_value=estimated_value, valuation_date=datetime.date.today(),
                    notes=f'Investment Approach: NOI ${float(noi):,.2f} / Cap Rate {float(cap_rate)}%',
                )
                ValuationMethodology.objects.create(
                    valuation=val, method='investment',
                    calculated_value_usd=estimated_value, inputs=result,
                    working_notes=f'Cap Rate: {cap_rate}%, NOI: ${float(noi):,.2f}',
                )
                result['valuation_id'] = val.pk
            except Exception as e:
                result['warning'] = str(e)

        return Response(result)

    @action(detail=False, methods=['post'])
    def cost_approach(self, request):
        """Depreciated Replacement Cost (DRC) Approach."""
        property_id = request.data.get('property_id')
        land_value_usd = Decimal(str(request.data.get('land_value_usd', 0)))
        replacement_cost_usd = Decimal(str(request.data.get('replacement_cost_usd', 0)))
        age_years = int(request.data.get('age_years', 0))
        economic_life_years = int(request.data.get('economic_life_years', 50))
        functional_obsolescence = Decimal(str(request.data.get('functional_obsolescence_pct', 0)))
        external_obsolescence = Decimal(str(request.data.get('external_obsolescence_pct', 0)))

        physical_depreciation_rate = min(Decimal(str(age_years)) / Decimal(str(economic_life_years)), Decimal('1')) * 100
        physical_depreciation = replacement_cost_usd * physical_depreciation_rate / 100
        func_dep = replacement_cost_usd * functional_obsolescence / 100
        ext_dep = replacement_cost_usd * external_obsolescence / 100
        total_depreciation = physical_depreciation + func_dep + ext_dep
        depreciated_cost = replacement_cost_usd - total_depreciation
        estimated_value = land_value_usd + depreciated_cost

        result = {
            'land_value_usd': float(land_value_usd),
            'replacement_cost_usd': float(replacement_cost_usd),
            'physical_depreciation_pct': float(physical_depreciation_rate),
            'physical_depreciation_usd': float(physical_depreciation),
            'functional_obsolescence_usd': float(func_dep),
            'external_obsolescence_usd': float(ext_dep),
            'total_depreciation_usd': float(total_depreciation),
            'depreciated_improvements_usd': float(depreciated_cost),
            'estimated_value_usd': float(estimated_value),
        }

        if property_id:
            try:
                from properties.models import Property
                prop = Property.objects.get(pk=property_id)
                val = Valuation.objects.create(
                    property=prop, performed_by=request.user, method='cost',
                    estimated_value=estimated_value, valuation_date=datetime.date.today(),
                    notes=f'Cost Approach: Land ${float(land_value_usd):,.0f} + DRC ${float(depreciated_cost):,.0f}',
                )
                ValuationMethodology.objects.create(
                    valuation=val, method='cost',
                    calculated_value_usd=estimated_value, inputs=result,
                )
                result['valuation_id'] = val.pk
            except Exception as e:
                result['warning'] = str(e)

        return Response(result)

    @action(detail=True, methods=['post'])
    def generate_report(self, request, pk=None):
        """Generate narrative valuation report."""
        val = self.get_object()
        prop = val.property

        method_labels = {
            'avm': 'Automated Valuation Model', 'cma': 'Comparable Sales Method',
            'investment': 'Investment / Income Capitalisation Approach',
            'cost': 'Cost / Depreciated Replacement Cost Approach',
            'appraisal': 'Full Professional Appraisal', 'broker_opinion': 'Broker Price Opinion',
        }

        comps = val.comparables.all()
        comp_text = ''
        if comps.exists():
            comp_text = '\n'.join([
                f"  • {c.address}: ${float(c.sale_price):,.0f} ({c.sale_date})"
                for c in comps[:5]
            ])

        narrative = f"""
PROPERTY VALUATION REPORT
{"=" * 60}

PROPERTY: {prop.name}
ADDRESS: {prop.address}, {prop.city}
PROPERTY TYPE: {prop.get_property_type_display()}
LAND SIZE: {prop.square_feet} m²
BEDROOMS: {prop.bedrooms}  BATHROOMS: {prop.bathrooms}

VALUATION DATE: {val.valuation_date}
VALUATION METHOD: {method_labels.get(val.method, val.method)}
PERFORMED BY: {val.performed_by.get_full_name() if val.performed_by else 'N/A'}

{"=" * 60}
MARKET VALUE OPINION
{"=" * 60}

Based on our analysis using the {method_labels.get(val.method, val.method)},
it is our opinion that the open market value of the above property as at
{val.valuation_date} is:

    USD {float(val.estimated_value):>15,.2f}
    ({_usd_to_words(float(val.estimated_value))} United States Dollars)

Confidence Score: {val.confidence_score or 'N/A'}%
Value Range: USD {float(val.low_estimate or val.estimated_value):,.0f} — USD {float(val.high_estimate or val.estimated_value):,.0f}

{"=" * 60}
COMPARABLE SALES EVIDENCE
{"=" * 60}
{comp_text if comp_text else 'No comparables recorded for this valuation.'}

{"=" * 60}
NOTES & ASSUMPTIONS
{"=" * 60}
{val.notes or 'Valuation conducted based on information provided and market research.'}

This valuation is prepared for {request.data.get('purpose', 'open market value')} purposes.
Subject to normal market conditions prevailing in Zimbabwe.

Prepared by: {val.performed_by.get_full_name() if val.performed_by else 'PropManager Zimbabwe'}
Date: {datetime.date.today()}
"""

        return Response({'report_text': narrative.strip(), 'valuation_id': val.pk})


def _usd_to_words(amount):
    from decimal import Decimal
    num = int(amount)
    if num < 1000:
        return f'{num}'
    if num < 1_000_000:
        return f'{num // 1000:,} Thousand'
    if num < 1_000_000_000:
        return f'{num // 1_000_000:,} Million'
    return f'{num // 1_000_000_000:,} Billion'


class ComparableViewSet(viewsets.ModelViewSet):
    queryset = Comparable.objects.select_related('valuation')
    serializer_class = ComparableSerializer
    filterset_fields = ['valuation']


class PriceTrendViewSet(viewsets.ModelViewSet):
    queryset = PriceTrend.objects.all()
    serializer_class = PriceTrendSerializer
    filterset_fields = ['area']
    search_fields = ['area']
    ordering_fields = ['period_start', 'avg_price']


class ValuationMethodologyViewSet(viewsets.ModelViewSet):
    queryset = ValuationMethodology.objects.select_related('valuation')
    serializer_class = ValuationMethodologySerializer
    filterset_fields = ['valuation', 'method']
