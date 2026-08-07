import datetime

from django.db.models import Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from .models import KYCProfile, MonitoredTransaction
from .serializers import KYCProfileSerializer, MonitoredTransactionSerializer
from .monitoring import generate_goaml_xml


class IsComplianceOfficer(BasePermission):
    """AML/KYC data is highly sensitive — restricted to admins and accountants
    (this app's finance/compliance officer role)."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in ('admin', 'accountant')
        )


class KYCProfileViewSet(viewsets.ModelViewSet):
    queryset = KYCProfile.objects.select_related('user', 'contact', 'verified_by')
    serializer_class = KYCProfileSerializer
    permission_classes = [IsComplianceOfficer]
    filterset_fields = ['status', 'risk_rating', 'is_pep']
    search_fields = ['full_name', 'id_number']
    ordering_fields = ['risk_score', 'created_at']

    def perform_create(self, serializer):
        profile = serializer.save()
        profile.calculate_risk_score()
        profile.save(update_fields=['risk_score', 'risk_rating'])

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        profile = self.get_object()
        profile.status = 'verified'
        profile.verified_by = request.user
        profile.verified_at = timezone.now()
        years = int(request.data.get('valid_years', 1))
        profile.expiry_date = datetime.date.today().replace(year=datetime.date.today().year + years)
        profile.calculate_risk_score()
        profile.save(update_fields=['status', 'verified_by', 'verified_at', 'expiry_date',
                                     'risk_score', 'risk_rating'])
        return Response(KYCProfileSerializer(profile).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        profile = self.get_object()
        profile.status = 'rejected'
        profile.calculate_risk_score()
        profile.save(update_fields=['status', 'risk_score', 'risk_rating'])
        return Response(KYCProfileSerializer(profile).data)

    @action(detail=True, methods=['post'], url_path='recalculate-risk')
    def recalculate_risk(self, request, pk=None):
        profile = self.get_object()
        profile.calculate_risk_score()
        profile.save(update_fields=['risk_score', 'risk_rating'])
        return Response(KYCProfileSerializer(profile).data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        qs = KYCProfile.objects.all()
        return Response({
            'total_profiles': qs.count(),
            'verified': qs.filter(status='verified').count(),
            'pending': qs.filter(status='pending').count(),
            'rejected': qs.filter(status='rejected').count(),
            'pep_count': qs.filter(is_pep=True).count(),
            'high_or_critical_risk': qs.filter(risk_rating__in=['high', 'critical']).count(),
        })


class MonitoredTransactionViewSet(viewsets.ModelViewSet):
    """Transaction Monitoring queue — created automatically by aml.monitoring.screen_transaction
    from money-movement call sites; staff triage flagged transactions here."""
    queryset = MonitoredTransaction.objects.select_related('subject', 'reviewed_by')
    serializer_class = MonitoredTransactionSerializer
    permission_classes = [IsComplianceOfficer]
    filterset_fields = ['status', 'risk_level', 'source_type', 'subject']
    ordering_fields = ['created_at', 'amount']
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    @action(detail=True, methods=['post'])
    def clear(self, request, pk=None):
        txn = self.get_object()
        txn.status = 'cleared'
        txn.reviewed_by = request.user
        txn.reviewed_at = timezone.now()
        txn.review_notes = request.data.get('notes', '')
        txn.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_notes'])
        return Response(MonitoredTransactionSerializer(txn).data)

    @action(detail=True, methods=['post'], url_path='report-to-fiu')
    def report_to_fiu(self, request, pk=None):
        txn = self.get_object()
        txn.status = 'reported'
        txn.reviewed_by = request.user
        txn.reviewed_at = timezone.now()
        txn.review_notes = request.data.get('notes', txn.review_notes)
        txn.reported_at = timezone.now()
        txn.goaml_reference = request.data.get(
            'goaml_reference', f'STR-{txn.pk}-{timezone.now().strftime("%Y%m%d")}')
        txn.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_notes',
                                 'reported_at', 'goaml_reference'])
        return Response(MonitoredTransactionSerializer(txn).data)

    @action(detail=True, methods=['get'], url_path='goaml-export')
    def goaml_export(self, request, pk=None):
        """Download the goAML-schema XML for this transaction, for manual upload to the
        FIU's goAML web portal (no public real-time submission API exists to push to)."""
        txn = self.get_object()
        xml_content = generate_goaml_xml(txn)
        response = HttpResponse(xml_content, content_type='application/xml')
        response['Content-Disposition'] = f'attachment; filename="goaml_str_{txn.pk}.xml"'
        return response

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        qs = MonitoredTransaction.objects.all()
        return Response({
            'total_flagged': qs.filter(status='flagged').count(),
            'cleared': qs.filter(status='cleared').count(),
            'reported': qs.filter(status='reported').count(),
            'critical_risk': qs.filter(risk_level='critical', status='flagged').count(),
            'total_flagged_amount': float(
                qs.filter(status='flagged').aggregate(t=Sum('amount'))['t'] or 0),
        })
