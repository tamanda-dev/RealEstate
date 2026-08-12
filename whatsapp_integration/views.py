from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
import json
from .models import WhatsAppConfig, WhatsAppTemplate, WhatsAppMessage
from .serializers import (WhatsAppConfigSerializer, WhatsAppConfigWriteSerializer,
                           WhatsAppTemplateSerializer, WhatsAppMessageSerializer,
                           SendMessageSerializer)


class WhatsAppConfigViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WhatsAppConfig.objects.all()

    @action(detail=False, methods=['get'], url_path='settings')
    def get_settings(self, request):
        # Named get_settings (not `settings`) — a same-named action method shadows
        # APIView.settings (DRF's own settings object class attribute), which breaks
        # dispatch() entirely for every request to this viewset, not just this action.
        config = WhatsAppConfig.get_config()
        return Response(WhatsAppConfigSerializer(config).data)

    @action(detail=False, methods=['patch', 'post'])
    def update_settings(self, request):
        config = WhatsAppConfig.get_config()
        serializer = WhatsAppConfigWriteSerializer(config, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by=request.user)
            return Response(WhatsAppConfigSerializer(config).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WhatsAppTemplateViewSet(viewsets.ModelViewSet):
    queryset = WhatsAppTemplate.objects.all()
    serializer_class = WhatsAppTemplateSerializer
    filterset_fields = ['usage_type', 'language', 'is_active', 'is_approved']
    search_fields = ['name', 'body_text']


class WhatsAppMessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WhatsAppMessage.objects.select_related('template', 'lead', 'contact', 'sent_by')
    serializer_class = WhatsAppMessageSerializer
    filterset_fields = ['direction', 'status', 'lead', 'contact']
    ordering_fields = ['sent_at']

    @action(detail=False, methods=['post'])
    def send(self, request):
        serializer = SendMessageSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        config = WhatsAppConfig.get_config()
        phone = data['phone']
        # The client sends the already-rendered text (what the user previewed and confirmed),
        # rather than raw template + variables — avoids the sender's variable substitution
        # falling out of sync with whatever the UI actually shows before sending.
        message_text = data['message']

        template = None
        if data.get('template_id'):
            template = WhatsAppTemplate.objects.filter(pk=data['template_id']).first()

        lead = None
        contact = None
        if data.get('lead_id'):
            from crm.models import Lead
            lead = Lead.objects.filter(pk=data['lead_id']).first()
        if data.get('contact_id'):
            from sales.models import Contact
            contact = Contact.objects.filter(pk=data['contact_id']).first()

        msg = WhatsAppMessage.objects.create(
            direction='outbound',
            contact_phone=phone,
            contact_name=lead.full_name if lead else (str(contact) if contact else ''),
            template=template,
            message_text=message_text,
            sent_by=request.user,
            lead=lead,
            contact=contact,
            status='simulated' if config.simulate_mode else 'pending',
        )

        if not config.simulate_mode and config.is_active:
            from crm.views import _send_via_meta
            _send_via_meta(config, phone, message_text, msg)

        return Response(WhatsAppMessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        return Response({
            'total_sent': WhatsAppMessage.objects.filter(direction='outbound').count(),
            'total_received': WhatsAppMessage.objects.filter(direction='inbound').count(),
            'delivered': WhatsAppMessage.objects.filter(status='delivered').count(),
            'read': WhatsAppMessage.objects.filter(status='read').count(),
            'failed': WhatsAppMessage.objects.filter(status='failed').count(),
            'simulated': WhatsAppMessage.objects.filter(status='simulated').count(),
        })


@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def whatsapp_webhook(request):
    if request.method == 'GET':
        config = WhatsAppConfig.get_config()
        verify_token = request.GET.get('hub.verify_token')
        challenge = request.GET.get('hub.challenge')
        if verify_token == config.webhook_verify_token:
            return HttpResponse(challenge, content_type='text/plain')
        return HttpResponse('Forbidden', status=403)

    try:
        body = json.loads(request.body)
        entries = body.get('entry', [])
        for entry in entries:
            for change in entry.get('changes', []):
                value = change.get('value', {})
                for msg in value.get('messages', []):
                    contact_info = value.get('contacts', [{}])[0]
                    WhatsAppMessage.objects.create(
                        direction='inbound',
                        contact_phone=msg.get('from', ''),
                        contact_name=contact_info.get('profile', {}).get('name', ''),
                        message_text=msg.get('text', {}).get('body', ''),
                        message_id=msg.get('id', ''),
                        status='delivered',
                    )
    except Exception:
        pass
    return HttpResponse('OK', content_type='text/plain')
