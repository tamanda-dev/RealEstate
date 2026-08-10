import csv
import datetime
import io

from django.db.models import Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from .models import KYCProfile, MonitoredTransaction, BeneficialOwner, WatchlistEntry
from .serializers import (KYCProfileSerializer, MonitoredTransactionSerializer,
                           BeneficialOwnerSerializer, WatchlistEntrySerializer)
from .monitoring import generate_goaml_xml
from .screening import run_watchlist_screening, screen_name_against_watchlist


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
        # Sanctions & PEP Screening happens automatically at intake, not as a separate
        # manual step — this is what "automatically" in the CDD requirement means in
        # practice: every new subject is screened the moment their file is created.
        run_watchlist_screening(profile)

    @action(detail=True, methods=['post'], url_path='screen-watchlist')
    def screen_watchlist(self, request, pk=None):
        """Re-run watchlist screening — use after correcting a name or when the watchlist
        itself has been refreshed with new entries."""
        profile = self.get_object()
        matches = run_watchlist_screening(profile)
        return Response({
            'matches': matches,
            'profile': KYCProfileSerializer(profile).data,
        })

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


class BeneficialOwnerViewSet(viewsets.ModelViewSet):
    """CDD for trust/corporate buyers — the natural persons who ultimately own/control
    a KYCProfile with entity_type != individual."""
    queryset = BeneficialOwner.objects.select_related('kyc_profile')
    serializer_class = BeneficialOwnerSerializer
    permission_classes = [IsComplianceOfficer]
    filterset_fields = ['kyc_profile']

    def perform_create(self, serializer):
        # A newly-added beneficial owner's own name is screened too — sanctions lists target
        # the natural person, not just the entity name on the property transaction.
        owner = serializer.save(watchlist_matches=screen_name_against_watchlist(
            serializer.validated_data.get('full_name', '')))
        self._recompute_parent(owner)

    def perform_update(self, serializer):
        full_name = serializer.validated_data.get('full_name', serializer.instance.full_name)
        owner = serializer.save(watchlist_matches=screen_name_against_watchlist(full_name))
        self._recompute_parent(owner)

    def perform_destroy(self, instance):
        profile = instance.kyc_profile
        instance.delete()
        profile.calculate_risk_score()
        profile.save(update_fields=['risk_score', 'risk_rating'])

    @staticmethod
    def _recompute_parent(owner):
        owner.kyc_profile.calculate_risk_score()
        owner.kyc_profile.save(update_fields=['risk_score', 'risk_rating'])


class WatchlistEntryViewSet(viewsets.ModelViewSet):
    """Sanctions/PEP watchlist compliance staff maintain locally (see aml/screening.py for
    why — no live commercial screening provider is connected)."""
    queryset = WatchlistEntry.objects.all()
    serializer_class = WatchlistEntrySerializer
    permission_classes = [IsComplianceOfficer]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ['list_source', 'entry_type', 'is_active']
    search_fields = ['full_name', 'aliases', 'country']

    @action(detail=False, methods=['post'], url_path='import-csv')
    def import_csv(self, request):
        """Bulk-load watchlist entries from a CSV (columns: full_name, aliases, list_source,
        entry_type, country, date_of_birth, notes — aliases pipe-separated). Sourced from the
        free public OFAC SDN / UN Consolidated List exports, or a locally-maintained PEP list."""
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            text = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response({'error': 'File must be UTF-8 encoded CSV'}, status=status.HTTP_400_BAD_REQUEST)

        valid_sources = {c[0] for c in WatchlistEntry.SOURCE_CHOICES}
        valid_types = {c[0] for c in WatchlistEntry.ENTRY_TYPE_CHOICES}
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for i, row in enumerate(reader, start=2):
            keys = {k.strip().lower(): (v or '').strip() for k, v in row.items() if k}
            full_name = keys.get('full_name')
            if not full_name:
                return Response({'error': f'Row {i}: full_name is required'},
                                 status=status.HTTP_400_BAD_REQUEST)
            list_source = keys.get('list_source', 'other') or 'other'
            entry_type = keys.get('entry_type', 'sanction') or 'sanction'
            dob = keys.get('date_of_birth') or None
            rows.append(WatchlistEntry(
                full_name=full_name,
                aliases=keys.get('aliases', '').replace('|', '\n'),
                list_source=list_source if list_source in valid_sources else 'other',
                entry_type=entry_type if entry_type in valid_types else 'sanction',
                country=keys.get('country', ''),
                date_of_birth=dob,
                notes=keys.get('notes', ''),
            ))

        if not rows:
            return Response({'error': 'No data rows found in file'}, status=status.HTTP_400_BAD_REQUEST)

        WatchlistEntry.objects.bulk_create(rows)
        return Response({'imported': len(rows)}, status=status.HTTP_201_CREATED)
