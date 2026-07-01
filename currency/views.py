from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import ExchangeRate
from .serializers import ExchangeRateSerializer


class ExchangeRateViewSet(viewsets.ModelViewSet):
    queryset = ExchangeRate.objects.select_related('set_by')
    serializer_class = ExchangeRateSerializer
    filterset_fields = ['source', 'is_active', 'date']
    ordering_fields = ['date', 'created_at']

    def perform_create(self, serializer):
        # Mark previous same-source same-date entries inactive
        date = serializer.validated_data.get('date')
        source = serializer.validated_data.get('source', 'manual')
        ExchangeRate.objects.filter(date=date, source=source).update(is_active=False)
        serializer.save(set_by=self.request.user, is_active=True)

    @action(detail=False, methods=['get'])
    def latest(self, request):
        rate = ExchangeRate.get_latest()
        if not rate:
            return Response({'detail': 'No exchange rate set.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ExchangeRateSerializer(rate).data)

    @action(detail=False, methods=['post'])
    def convert(self, request):
        amount = request.data.get('amount')
        direction = request.data.get('direction', 'usd_to_zig')
        rate_id = request.data.get('exchange_rate_id')
        try:
            if rate_id:
                rate = ExchangeRate.objects.get(pk=rate_id)
            else:
                rate = ExchangeRate.get_latest()
            if not rate:
                return Response({'error': 'No exchange rate available'}, status=400)
            if direction == 'usd_to_zig':
                result = rate.convert_usd_to_zig(amount)
            else:
                result = rate.convert_zig_to_usd(amount)
            return Response({
                'input': float(amount),
                'direction': direction,
                'result': float(result),
                'rate': float(rate.usd_to_zig),
                'rate_date': str(rate.date),
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)
