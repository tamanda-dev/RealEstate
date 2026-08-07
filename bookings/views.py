from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
import datetime
from .models import Quotation, Reservation, HandoverChecklist, HandoverItem
from .serializers import (QuotationSerializer, ReservationSerializer,
                           HandoverChecklistSerializer, HandoverItemSerializer)


class QuotationViewSet(viewsets.ModelViewSet):
    queryset = Quotation.objects.select_related('property', 'unit', 'contact', 'lead', 'exchange_rate')
    serializer_class = QuotationSerializer
    filterset_fields = ['status', 'property', 'deal_type', 'generated_by']
    search_fields = ['reference']
    ordering_fields = ['created_at', 'total_usd']

    def perform_create(self, serializer):
        from currency.models import ExchangeRate
        rate = ExchangeRate.get_latest()
        serializer.save(generated_by=self.request.user, exchange_rate=rate)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        quote = self.get_object()
        quote.status = 'sent'
        quote.save(update_fields=['status'])
        # Optionally send via WhatsApp
        phone = request.data.get('whatsapp_phone')
        if phone:
            msg_text = (
                f"Dear {request.data.get('recipient_name', 'Client')},\n\n"
                f"Please find your property quotation from PropManager Zimbabwe:\n\n"
                f"*Reference:* {quote.reference}\n"
                f"*Property:* {quote.property.name}\n"
                f"*Base Price:* USD ${quote.base_price_usd:,.2f}\n"
                f"*Total (incl. VAT & fees):* USD ${quote.total_usd:,.2f}\n"
                f"*ZiG Equivalent:* ZiG {quote.total_zig:,.2f}\n"
                f"*Valid Until:* {quote.valid_until}\n\n"
                f"Contact us to proceed. Thank you!"
            )
            _log_whatsapp(phone, msg_text, request.user, contact=quote.contact, lead=quote.lead)
        return Response(QuotationSerializer(quote).data)

    @action(detail=False, methods=['post'])
    def calculate(self, request):
        """Preview totals without saving."""
        from decimal import Decimal
        from currency.models import ExchangeRate
        base = Decimal(str(request.data.get('base_price_usd', 0)))
        discount = Decimal(str(request.data.get('discount_amount_usd', 0)))
        vat_rate = Decimal(str(request.data.get('vat_rate', '15.5')))
        stamp = Decimal(str(request.data.get('stamp_duty_usd', 0)))
        reg = Decimal(str(request.data.get('registration_fees_usd', 0)))
        legal = Decimal(str(request.data.get('legal_fees_usd', 0)))
        parking = Decimal(str(request.data.get('parking_cost_usd', 0)))
        other = Decimal(str(request.data.get('other_charges_usd', 0)))

        discounted = base - discount
        extras = stamp + reg + legal + parking + other
        vat = round(discounted * vat_rate / 100, 2)
        subtotal = discounted + extras
        total = subtotal + vat

        rate = ExchangeRate.get_latest()
        total_zig = rate.convert_usd_to_zig(total) if rate else 0

        return Response({
            'base_price_usd': float(base),
            'discount_amount_usd': float(discount),
            'discounted_price_usd': float(discounted),
            'extras_usd': float(extras),
            'vat_amount_usd': float(vat),
            'subtotal_usd': float(subtotal),
            'total_usd': float(total),
            'total_zig': float(total_zig),
            'exchange_rate': float(rate.usd_to_zig) if rate else None,
            'rate_date': str(rate.date) if rate else None,
        })


class ReservationViewSet(viewsets.ModelViewSet):
    queryset = Reservation.objects.select_related('property', 'unit', 'contact', 'lead', 'quotation')
    serializer_class = ReservationSerializer
    filterset_fields = ['status', 'property', 'deal_type', 'reserved_by']
    ordering_fields = ['created_at', 'valid_until']

    def perform_create(self, serializer):
        serializer.save(reserved_by=self.request.user)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        res = self.get_object()
        res.status = 'active'
        res.payment_received_date = request.data.get('payment_received_date', datetime.date.today().isoformat())
        res.payment_method = request.data.get('payment_method', '')
        res.payment_reference = request.data.get('payment_reference', '')
        res.save()

        from accounting.models import Receipt
        Receipt.objects.create(
            source_type='reservation_token', source_id=res.pk,
            payer_name=res.contact.full_name if res.contact else 'Unknown',
            amount=res.token_amount_usd, currency='USD', payment_method=res.payment_method,
            reference=res.payment_reference,
            description=f'Reservation token — {res.reservation_number}',
            property=res.property, received_date=res.payment_received_date, issued_by=request.user,
        )
        return Response(ReservationSerializer(res).data)

    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        soon = datetime.date.today() + datetime.timedelta(days=7)
        qs = Reservation.objects.filter(status='active', valid_until__lte=soon)
        return Response(ReservationSerializer(qs, many=True).data)


class HandoverChecklistViewSet(viewsets.ModelViewSet):
    queryset = HandoverChecklist.objects.select_related('property', 'unit', 'lease', 'inspector').prefetch_related('items')
    serializer_class = HandoverChecklistSerializer
    filterset_fields = ['status', 'handover_type', 'property', 'inspector']
    ordering_fields = ['created_at', 'inspection_date']

    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        checklist = self.get_object()
        serializer = HandoverItemSerializer(data={**request.data, 'checklist': checklist.pk})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def sign_off(self, request, pk=None):
        checklist = self.get_object()
        outstanding = checklist.items.filter(condition='fail', resolved=False).count()
        if outstanding > 0:
            return Response({'error': f'{outstanding} snag(s) still unresolved'}, status=status.HTTP_400_BAD_REQUEST)
        checklist.status = 'signed_off'
        checklist.signed_off_at = timezone.now()
        checklist.save()
        return Response(HandoverChecklistSerializer(checklist).data)


class HandoverItemViewSet(viewsets.ModelViewSet):
    queryset = HandoverItem.objects.select_related('checklist')
    serializer_class = HandoverItemSerializer
    filterset_fields = ['checklist', 'category', 'condition', 'resolved']


def _log_whatsapp(phone, text, user, contact=None, lead=None):
    try:
        from whatsapp_integration.models import WhatsAppMessage, WhatsAppConfig
        config = WhatsAppConfig.get_config()
        msg = WhatsAppMessage.objects.create(
            direction='outbound', contact_phone=phone,
            message_text=text, sent_by=user,
            contact=contact, lead=lead,
            status='simulated' if config.simulate_mode else 'pending',
        )
        if not config.simulate_mode:
            from crm.views import _send_via_meta
            _send_via_meta(config, phone, text, msg)
    except Exception:
        pass
