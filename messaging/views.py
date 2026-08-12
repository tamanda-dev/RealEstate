from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from backend.sms import send_sms
from .models import EmailMessage, SMSMessage, EmailTemplate
from .serializers import (EmailMessageSerializer, SendEmailSerializer, BulkSendEmailSerializer,
                           SMSMessageSerializer, SendSMSSerializer, EmailTemplateSerializer)

User = get_user_model()


def _resolve_lead_contact(data):
    lead = None
    contact = None
    if data.get('lead_id'):
        from crm.models import Lead
        lead = Lead.objects.filter(pk=data['lead_id']).first()
    if data.get('contact_id'):
        from sales.models import Contact
        contact = Contact.objects.filter(pk=data['contact_id']).first()
    return lead, contact


class EmailTemplateViewSet(viewsets.ModelViewSet):
    queryset = EmailTemplate.objects.all()
    serializer_class = EmailTemplateSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active']
    search_fields = ['name', 'subject']


class EmailMessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EmailMessage.objects.select_related('lead', 'contact', 'sent_by', 'recipient')
    serializer_class = EmailMessageSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'lead', 'contact', 'recipient']
    ordering_fields = ['sent_at']

    @action(detail=False, methods=['post'])
    def send(self, request):
        serializer = SendEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        lead, contact = _resolve_lead_contact(data)
        recipient = User.objects.filter(pk=data['recipient_id']).first() if data.get('recipient_id') else None

        msg = EmailMessage.objects.create(
            to_email=data['to_email'], to_name=data.get('to_name', ''), recipient=recipient,
            subject=data['subject'], body=data['body'],
            lead=lead, contact=contact, sent_by=request.user, status='sent',
        )
        try:
            send_mail(
                subject=data['subject'], message=data['body'],
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[data['to_email']], fail_silently=False,
            )
        except Exception as exc:
            msg.status = 'failed'
            msg.error_message = str(exc)[:500]
            msg.save(update_fields=['status', 'error_message'])
            return Response(EmailMessageSerializer(msg).data, status=status.HTTP_502_BAD_GATEWAY)
        return Response(EmailMessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='bulk-send')
    def bulk_send(self, request):
        """Send the same (optionally templated) email to many registered users at once —
        e.g. every landlord or every tenant. Each recipient gets their own EmailMessage log
        row and their own send attempt, so one bad address can't sink the whole batch."""
        serializer = BulkSendEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data

        template = None
        if data.get('template_id'):
            template = EmailTemplate.objects.filter(pk=data['template_id']).first()
            if not template:
                return Response({'error': 'Template not found.'}, status=status.HTTP_404_NOT_FOUND)

        recipients = User.objects.filter(pk__in=data['recipient_ids']).exclude(email='')
        sent, failed = [], []
        for user in recipients:
            variables = {'name': user.get_full_name() or user.username, 'email': user.email}
            if template:
                subject, body = template.render(variables)
            else:
                subject, body = data.get('subject', ''), data.get('body', '')
                for key, val in variables.items():
                    subject = subject.replace(f'{{{{{key}}}}}', str(val))
                    body = body.replace(f'{{{{{key}}}}}', str(val))

            msg = EmailMessage.objects.create(
                to_email=user.email, to_name=user.get_full_name() or user.username, recipient=user,
                subject=subject, body=body, sent_by=request.user, status='sent',
            )
            try:
                send_mail(subject=subject, message=body, from_email=settings.DEFAULT_FROM_EMAIL,
                          recipient_list=[user.email], fail_silently=False)
                sent.append(user.id)
            except Exception as exc:
                msg.status = 'failed'
                msg.error_message = str(exc)[:500]
                msg.save(update_fields=['status', 'error_message'])
                failed.append(user.id)

        skipped = len(data['recipient_ids']) - recipients.count()
        return Response({'sent': len(sent), 'failed': len(failed), 'skipped_no_email': skipped})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        return Response({
            'total_sent': EmailMessage.objects.filter(status='sent').count(),
            'failed': EmailMessage.objects.filter(status='failed').count(),
        })


class SMSMessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SMSMessage.objects.select_related('lead', 'contact', 'sent_by', 'recipient')
    serializer_class = SMSMessageSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'lead', 'contact', 'recipient']
    ordering_fields = ['sent_at']

    @action(detail=False, methods=['post'])
    def send(self, request):
        serializer = SendSMSSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        lead, contact = _resolve_lead_contact(data)
        recipient = User.objects.filter(pk=data['recipient_id']).first() if data.get('recipient_id') else None

        msg = SMSMessage.objects.create(
            to_phone=data['to_phone'], to_name=data.get('to_name', ''), recipient=recipient,
            body=data['body'], lead=lead, contact=contact,
            sent_by=request.user, status='sent',
        )
        try:
            sid = send_sms(data['to_phone'], data['body'])
            msg.status = 'simulated' if sid == 'SIMULATED' else 'sent'
            msg.twilio_sid = '' if sid == 'SIMULATED' else sid
            msg.save(update_fields=['status', 'twilio_sid'])
        except Exception as exc:
            msg.status = 'failed'
            msg.error_message = str(exc)[:500]
            msg.save(update_fields=['status', 'error_message'])
            return Response(SMSMessageSerializer(msg).data, status=status.HTTP_502_BAD_GATEWAY)
        return Response(SMSMessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        return Response({
            'total_sent': SMSMessage.objects.filter(status='sent').count(),
            'failed': SMSMessage.objects.filter(status='failed').count(),
            'simulated': SMSMessage.objects.filter(status='simulated').count(),
        })
