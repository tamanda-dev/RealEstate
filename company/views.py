from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CompanySettings
from .serializers import CompanySettingsSerializer


class CompanySettingsViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    queryset = CompanySettings.objects.all()

    @action(detail=False, methods=['get'], url_path='settings')
    def get_settings(self, request):
        # Named get_settings (not `settings`) — a same-named action method shadows
        # APIView.settings (DRF's own settings object class attribute), which breaks
        # dispatch() entirely for every request to this viewset, not just this action.
        # Any authenticated user can read this — report headers across the app need
        # the company name/logo regardless of the viewer's role.
        return Response(CompanySettingsSerializer(CompanySettings.get_settings()).data)

    @action(detail=False, methods=['patch', 'post'])
    def update_settings(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Only an admin can update company settings.'},
                             status=status.HTTP_403_FORBIDDEN)
        obj = CompanySettings.get_settings()
        serializer = CompanySettingsSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by=request.user)
            return Response(CompanySettingsSerializer(obj).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
