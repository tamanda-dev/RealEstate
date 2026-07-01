from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
import datetime
from .models import PropertyDocument
from .serializers import PropertyDocumentSerializer


class PropertyDocumentViewSet(viewsets.ModelViewSet):
    queryset = PropertyDocument.objects.select_related('property', 'unit', 'uploaded_by')
    serializer_class = PropertyDocumentSerializer
    filterset_fields = ['property', 'document_type', 'is_confidential', 'is_public']
    search_fields = ['title', 'notes']
    ordering_fields = ['created_at', 'document_type', 'expiry_date']

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)

    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        days = int(request.query_params.get('days', 30))
        future = datetime.date.today() + datetime.timedelta(days=days)
        qs = self.get_queryset().filter(
            expiry_date__isnull=False,
            expiry_date__lte=future,
            expiry_date__gte=datetime.date.today(),
        )
        return Response(PropertyDocumentSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def by_property(self, request):
        property_id = request.query_params.get('property')
        if not property_id:
            return Response({'error': 'property param required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.get_queryset().filter(property_id=property_id)
        grouped = {}
        for doc in qs:
            key = doc.get_document_type_display()
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(PropertyDocumentSerializer(doc).data)
        return Response(grouped)
