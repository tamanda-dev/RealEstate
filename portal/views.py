from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, Count, Avg
import datetime

from .models import SavedListing, ViewingRequest, BuyerOffer, AgentKPI, DiscountApproval
from .serializers import (SavedListingSerializer, ViewingRequestSerializer, BuyerOfferSerializer,
                           AgentKPISerializer, DiscountApprovalSerializer)


class IsSalesManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('admin', 'sales_manager')


class IsAgentOrManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            'admin', 'sales_manager', 'agent', 'manager')


# ── Buyer Portal ──────────────────────────────────────────────────────────────

class SavedListingViewSet(viewsets.ModelViewSet):
    serializer_class = SavedListingSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role in ('admin', 'sales_manager', 'agent', 'manager'):
            return SavedListing.objects.select_related('buyer', 'listing__property').all()
        return SavedListing.objects.filter(buyer=user).select_related('listing__property')

    def perform_create(self, serializer):
        serializer.save(buyer=self.request.user)

    @action(detail=False, methods=['get'])
    def my_favourites(self, request):
        qs = SavedListing.objects.filter(buyer=request.user).select_related('listing__property')
        return Response(SavedListingSerializer(qs, many=True).data)


class ViewingRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ViewingRequestSerializer
    filterset_fields = ['status', 'listing', 'agent']
    ordering_fields = ['created_at', 'confirmed_datetime']

    def get_queryset(self):
        user = self.request.user
        if user.role in ('admin', 'sales_manager', 'manager'):
            return ViewingRequest.objects.select_related('buyer', 'listing__property', 'agent').all()
        if user.role == 'agent':
            return ViewingRequest.objects.filter(agent=user).select_related('buyer', 'listing__property')
        # buyer sees own requests
        return ViewingRequest.objects.filter(buyer=user).select_related('listing__property', 'agent')

    def perform_create(self, serializer):
        user = self.request.user
        # Auto-assign listing agent
        listing = serializer.validated_data.get('listing')
        agent = listing.listing_agent if listing else None
        serializer.save(buyer=user, agent=agent)

    @action(detail=True, methods=['post'], permission_classes=[IsAgentOrManager()])
    def schedule(self, request, pk=None):
        viewing = self.get_object()
        viewing.confirmed_datetime = request.data.get('confirmed_datetime')
        viewing.agent = request.user if request.user.role == 'agent' else viewing.agent
        viewing.agent_notes = request.data.get('agent_notes', '')
        viewing.status = 'scheduled'
        viewing.save()
        return Response(ViewingRequestSerializer(viewing).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        viewing = self.get_object()
        viewing.status = 'completed'
        viewing.feedback = request.data.get('feedback', '')
        viewing.rating = request.data.get('rating')
        viewing.save()
        return Response(ViewingRequestSerializer(viewing).data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'pending': qs.filter(status='pending').count(),
            'scheduled': qs.filter(status='scheduled').count(),
            'completed': qs.filter(status='completed').count(),
            'cancelled': qs.filter(status='cancelled').count(),
        })


class BuyerOfferViewSet(viewsets.ModelViewSet):
    serializer_class = BuyerOfferSerializer
    filterset_fields = ['status', 'listing']
    ordering_fields = ['created_at', 'offer_amount_usd']

    def get_queryset(self):
        user = self.request.user
        if user.role in ('admin', 'sales_manager', 'manager'):
            return BuyerOffer.objects.select_related('buyer', 'listing__property', 'agent').all()
        if user.role == 'agent':
            return BuyerOffer.objects.filter(agent=user)
        if user.role in ('landlord', 'owner'):
            return BuyerOffer.objects.filter(listing__property__owner=user)
        return BuyerOffer.objects.filter(buyer=user)

    def perform_create(self, serializer):
        listing = serializer.validated_data.get('listing')
        agent = listing.listing_agent if listing else None
        serializer.save(buyer=self.request.user, agent=agent)

    @action(detail=True, methods=['post'], permission_classes=[IsAgentOrManager()])
    def review(self, request, pk=None):
        offer = self.get_object()
        offer.status = 'under_review'
        offer.save(update_fields=['status'])
        return Response(BuyerOfferSerializer(offer).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAgentOrManager()])
    def accept(self, request, pk=None):
        offer = self.get_object()
        offer.status = 'accepted'
        offer.save(update_fields=['status'])
        return Response(BuyerOfferSerializer(offer).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAgentOrManager()])
    def reject(self, request, pk=None):
        offer = self.get_object()
        offer.status = 'rejected'
        offer.rejection_reason = request.data.get('reason', '')
        offer.save()
        return Response(BuyerOfferSerializer(offer).data)


# ── Sales Manager Tools ───────────────────────────────────────────────────────

class AgentKPIViewSet(viewsets.ModelViewSet):
    queryset = AgentKPI.objects.select_related('agent', 'recorded_by')
    serializer_class = AgentKPISerializer
    permission_classes = [IsSalesManager]
    filterset_fields = ['agent']
    ordering_fields = ['-period_end']

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

    @action(detail=False, methods=['get'])
    def team_summary(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        agents = User.objects.filter(role__in=('agent', 'manager'))
        result = []
        for agent in agents:
            latest = AgentKPI.objects.filter(agent=agent).order_by('-period_end').first()
            if latest:
                result.append(AgentKPISerializer(latest).data)
            else:
                # Compute on-the-fly from CRM if no manual KPI
                from crm.models import Lead
                from lettings.models import LandlordDisbursement
                leads = Lead.objects.filter(assigned_to=agent)
                result.append({
                    'agent_id': agent.pk,
                    'agent_name': agent.get_full_name() or agent.username,
                    'leads_assigned': leads.count(),
                    'leads_converted': leads.filter(status='won').count(),
                    'deals_closed': leads.filter(status='won').count(),
                    'conversion_rate': round(
                        leads.filter(status='won').count() / max(leads.count(), 1) * 100, 1),
                    'viewings_conducted': ViewingRequest.objects.filter(
                        agent=agent, status='completed').count(),
                    'period_start': None, 'period_end': None,
                })
        result.sort(key=lambda x: -(x.get('conversion_rate') or 0))
        return Response(result)


class DiscountApprovalViewSet(viewsets.ModelViewSet):
    queryset = DiscountApproval.objects.select_related(
        'listing__property', 'requested_by', 'approved_by')
    serializer_class = DiscountApprovalSerializer
    filterset_fields = ['status', 'listing']
    ordering_fields = ['-created_at']

    def get_permissions(self):
        if self.action in ['approve', 'reject_discount']:
            return [IsSalesManager()]
        return [IsAgentOrManager()]

    def perform_create(self, serializer):
        listing = serializer.validated_data['listing']
        serializer.save(
            requested_by=self.request.user,
            original_price_usd=listing.asking_price,
            discount_pct=round(
                (1 - float(serializer.validated_data['requested_price_usd']) /
                 float(listing.asking_price)) * 100, 2
            ),
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        discount = self.get_object()
        discount.status = 'approved'
        discount.approved_by = request.user
        discount.approval_notes = request.data.get('notes', '')
        discount.decided_at = timezone.now()
        discount.save()
        # Update the listing price
        discount.listing.asking_price = discount.requested_price_usd
        discount.listing.save(update_fields=['asking_price'])
        return Response(DiscountApprovalSerializer(discount).data)

    @action(detail=True, methods=['post'])
    def reject_discount(self, request, pk=None):
        discount = self.get_object()
        discount.status = 'rejected'
        discount.approved_by = request.user
        discount.approval_notes = request.data.get('notes', '')
        discount.decided_at = timezone.now()
        discount.save()
        return Response(DiscountApprovalSerializer(discount).data)

    @action(detail=False, methods=['get'])
    def pending_count(self, request):
        count = DiscountApproval.objects.filter(status='pending').count()
        return Response({'pending': count})


# ── Landlord / Seller Portal ──────────────────────────────────────────────────

@action(detail=False, methods=['get'])
def landlord_portfolio_stats(request):
    """Summary stats for the logged-in landlord's properties."""
    from properties.models import Property
    from rent.models import Invoice
    user = request.user
    props = Property.objects.filter(owner=user)
    total_rent = float(
        Invoice.objects.filter(property__in=props, status='paid')
        .aggregate(t=Sum('paid_amount'))['t'] or 0
    )
    return Response({
        'properties': props.count(),
        'rented': props.filter(status='rented').count(),
        'available': props.filter(status='available').count(),
        'portfolio_value': float(props.aggregate(v=Sum('current_value'))['v'] or 0),
        'total_rent_collected': total_rent,
    })
