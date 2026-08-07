from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum
from .models import Listing, Contact, Offer, CommissionStructure, Transaction
from .serializers import (ListingSerializer, ContactSerializer, OfferSerializer,
                           CommissionStructureSerializer, CommissionCalculationSerializer,
                           TransactionSerializer)


class ListingViewSet(viewsets.ModelViewSet):
    queryset = Listing.objects.select_related('property', 'listing_agent').prefetch_related('offers')
    serializer_class = ListingSerializer
    filterset_fields = ['listing_type', 'status', 'listing_agent']
    search_fields = ['property__name', 'property__address', 'mls_number']
    ordering_fields = ['asking_price', 'listing_date', 'days_on_market']

    @action(detail=True, methods=['post'])
    def track_view(self, request, pk=None):
        listing = self.get_object()
        listing.views_count += 1
        listing.save(update_fields=['views_count'])
        return Response({'views_count': listing.views_count})

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        stats = {
            'active': Listing.objects.filter(status='active').count(),
            'pending': Listing.objects.filter(status='pending').count(),
            'sold': Listing.objects.filter(status='sold').count(),
            'total_listed_value': Listing.objects.filter(status='active').aggregate(
                v=Sum('asking_price'))['v'] or 0,
            'total_sold_value': Transaction.objects.aggregate(v=Sum('sale_price'))['v'] or 0,
        }
        return Response(stats)


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.select_related('agent', 'user')
    serializer_class = ContactSerializer
    filterset_fields = ['contact_type', 'status', 'agent']
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    ordering_fields = ['created_at', 'last_name']

    @action(detail=True, methods=['post'], url_path='link-user')
    def link_user(self, request, pk=None):
        """Identity chain fix: links this Contact to the platform User account for the same
        person (e.g. once a walk-in buyer registers on the buyer portal), so their CRM
        history, KYC profile, and portal activity are recognized as one person instead of
        living in two disconnected records. Pass user_id explicitly, or omit it to
        auto-match by email."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        contact = self.get_object()

        user_id = request.data.get('user_id')
        if user_id:
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        elif contact.email:
            user = User.objects.filter(email__iexact=contact.email).first()
            if not user:
                return Response({'error': f'No user account found matching email {contact.email}. '
                                          f'Pass user_id explicitly instead.'},
                                 status=status.HTTP_404_NOT_FOUND)
        else:
            return Response({'error': 'Contact has no email to auto-match; pass user_id explicitly.'},
                             status=status.HTTP_400_BAD_REQUEST)

        if hasattr(user, 'sales_contact') and user.sales_contact.pk != contact.pk:
            return Response({'error': f'{user.username} is already linked to a different contact.'},
                             status=status.HTTP_400_BAD_REQUEST)

        contact.user = user
        contact.save(update_fields=['user'])
        return Response(ContactSerializer(contact).data)


class OfferViewSet(viewsets.ModelViewSet):
    queryset = Offer.objects.select_related('listing', 'buyer', 'agent')
    serializer_class = OfferSerializer
    filterset_fields = ['status', 'listing', 'buyer']
    ordering_fields = ['offer_amount', 'created_at', 'closing_date']

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        offer = self.get_object()
        offer.status = 'accepted'
        offer.save()
        offer.listing.status = 'pending'
        offer.listing.save()
        return Response(OfferSerializer(offer).data)

    @action(detail=True, methods=['post'])
    def counter(self, request, pk=None):
        offer = self.get_object()
        offer.status = 'countered'
        offer.counter_amount = request.data.get('counter_amount')
        offer.save()
        return Response(OfferSerializer(offer).data)


class CommissionStructureViewSet(viewsets.ModelViewSet):
    queryset = CommissionStructure.objects.all()
    serializer_class = CommissionStructureSerializer

    @action(detail=False, methods=['post'])
    def calculate(self, request):
        serializer = CommissionCalculationSerializer(data=request.data)
        if serializer.is_valid():
            try:
                structure = CommissionStructure.objects.get(
                    pk=serializer.validated_data['commission_structure_id'])
                result = structure.calculate(serializer.validated_data['sale_price'])
                return Response({k: float(v) for k, v in result.items()})
            except CommissionStructure.DoesNotExist:
                return Response({'error': 'Commission structure not found'},
                                status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related('listing', 'accepted_offer')
    serializer_class = TransactionSerializer
    filterset_fields = ['listing']
    ordering_fields = ['closing_date', 'sale_price']

    def perform_create(self, serializer):
        txn = serializer.save()
        # AML transaction monitoring — property sales are the highest-value, highest-risk
        # money movement in the system, so always screen the buyer on closing.
        buyer = txn.accepted_offer.buyer if txn.accepted_offer else None
        if buyer:
            from aml.monitoring import screen_transaction, get_or_create_profile_for_contact
            screen_transaction(
                subject=get_or_create_profile_for_contact(buyer),
                amount=txn.sale_price, currency='USD', payment_method='',
                transaction_date=txn.closing_date, source_type='property_sale', source_id=txn.pk,
                description=f'Property sale — {txn.listing.property.name if txn.listing else ""}',
            )
