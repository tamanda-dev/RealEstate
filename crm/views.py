from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Sum, Q
import datetime
from .models import PipelineStage, Lead, Opportunity, Interaction, Campaign
from .serializers import (PipelineStageSerializer, LeadSerializer,
                           OpportunitySerializer, InteractionSerializer, CampaignSerializer)


class PipelineStageViewSet(viewsets.ModelViewSet):
    queryset = PipelineStage.objects.all()
    serializer_class = PipelineStageSerializer
    filterset_fields = ['deal_type']
    ordering_fields = ['order']


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.select_related('assigned_to').prefetch_related('interactions')
    serializer_class = LeadSerializer
    search_fields = ['first_name', 'last_name', 'email', 'phone', 'whatsapp_number']
    filterset_fields = ['status', 'source', 'deal_type', 'assigned_to']
    ordering_fields = ['created_at', 'next_followup']

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        today = datetime.date.today()
        stats = {
            'total': Lead.objects.count(),
            'new': Lead.objects.filter(status='new').count(),
            'contacted': Lead.objects.filter(status='contacted').count(),
            'qualified': Lead.objects.filter(status='qualified').count(),
            'won': Lead.objects.filter(status='won').count(),
            'lost': Lead.objects.filter(status='lost').count(),
            'followup_today': Lead.objects.filter(next_followup=today).count(),
            'followup_overdue': Lead.objects.filter(
                next_followup__lt=today, status__in=['new', 'contacted', 'qualified', 'site_visit', 'negotiating']
            ).count(),
            'by_source': list(Lead.objects.values('source').annotate(c=Count('id')).order_by('-c')),
        }
        return Response(stats)

    @action(detail=True, methods=['post'])
    def advance_stage(self, request, pk=None):
        lead = self.get_object()
        stages = ['new', 'contacted', 'qualified', 'site_visit', 'negotiating', 'won']
        try:
            current_idx = stages.index(lead.status)
            if current_idx < len(stages) - 1:
                lead.status = stages[current_idx + 1]
                lead.save()
        except ValueError:
            pass
        return Response(LeadSerializer(lead).data)

    @action(detail=True, methods=['post'])
    def log_interaction(self, request, pk=None):
        lead = self.get_object()
        data = {**request.data, 'lead': lead.pk, 'agent': request.user.pk}
        serializer = InteractionSerializer(data=data)
        if serializer.is_valid():
            interaction = serializer.save()
            if request.data.get('next_followup_date'):
                lead.next_followup = request.data['next_followup_date']
                lead.save(update_fields=['next_followup'])
            return Response(InteractionSerializer(interaction).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OpportunityViewSet(viewsets.ModelViewSet):
    queryset = Opportunity.objects.select_related('lead', 'stage', 'property', 'assigned_to')
    serializer_class = OpportunitySerializer
    filterset_fields = ['stage', 'deal_type', 'assigned_to', 'lead']
    ordering_fields = ['created_at', 'expected_close_date', 'expected_value_usd']

    @action(detail=False, methods=['get'])
    def kanban(self, request):
        deal_type = request.query_params.get('deal_type', 'sale')
        stages = PipelineStage.objects.filter(Q(deal_type=deal_type) | Q(deal_type='all'))
        result = []
        for stage in stages:
            opps = Opportunity.objects.filter(stage=stage).select_related('lead', 'property')
            result.append({
                'stage': PipelineStageSerializer(stage).data,
                'opportunities': OpportunitySerializer(opps, many=True).data,
                'total_value': float(opps.aggregate(t=Sum('expected_value_usd'))['t'] or 0),
                'count': opps.count(),
            })
        return Response(result)


class InteractionViewSet(viewsets.ModelViewSet):
    queryset = Interaction.objects.select_related('lead', 'contact', 'agent', 'property')
    serializer_class = InteractionSerializer
    filterset_fields = ['interaction_type', 'direction', 'outcome', 'lead', 'contact', 'agent']
    ordering_fields = ['created_at']

    def perform_create(self, serializer):
        serializer.save(agent=self.request.user)


class CampaignViewSet(viewsets.ModelViewSet):
    queryset = Campaign.objects.select_related('created_by')
    serializer_class = CampaignSerializer
    filterset_fields = ['campaign_type', 'status']

    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        campaign = self.get_object()
        leads = Lead.objects.all()
        if campaign.target_statuses:
            leads = leads.filter(status__in=campaign.target_statuses)

        sent = 0
        for lead in leads:
            phone = lead.whatsapp_number or lead.phone
            if phone:
                from whatsapp_integration.models import WhatsAppMessage, WhatsAppConfig
                config = WhatsAppConfig.get_config()
                msg = WhatsAppMessage.objects.create(
                    direction='outbound',
                    contact_phone=phone,
                    contact_name=lead.full_name,
                    message_text=campaign.message_body,
                    lead=lead,
                    sent_by=request.user,
                    status='simulated' if config.simulate_mode else 'pending',
                )
                if not config.simulate_mode:
                    _send_via_meta(config, phone, campaign.message_body, msg)
                sent += 1

        campaign.sent_count = sent
        campaign.status = 'completed'
        campaign.save()
        return Response({'sent': sent, 'status': 'completed'})


def _send_via_meta(config, phone, text, msg_obj):
    import requests
    try:
        resp = requests.post(
            f'https://graph.facebook.com/v19.0/{config.phone_number_id}/messages',
            headers={'Authorization': f'Bearer {config.access_token}', 'Content-Type': 'application/json'},
            json={'messaging_product': 'whatsapp', 'to': phone, 'type': 'text', 'text': {'body': text}},
            timeout=10,
        )
        data = resp.json()
        if resp.status_code == 200:
            msg_obj.message_id = data.get('messages', [{}])[0].get('id', '')
            msg_obj.status = 'sent'
        else:
            msg_obj.status = 'failed'
            msg_obj.error_message = str(data)
        msg_obj.save(update_fields=['message_id', 'status', 'error_message'])
    except Exception as e:
        msg_obj.status = 'failed'
        msg_obj.error_message = str(e)
        msg_obj.save(update_fields=['status', 'error_message'])
