from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
import datetime
from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    filterset_fields = ['is_read', 'notification_type', 'priority']
    ordering_fields = ['created_at']

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'count': count})

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        updated = Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'marked_read': updated})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notif).data)

    @action(detail=False, methods=['post'])
    def generate_alerts(self, request):
        """Scan system state and generate notifications for time-based events."""
        created = 0

        # Expiring leases
        from leases.models import Lease
        from django.contrib.auth import get_user_model
        User = get_user_model()

        today = datetime.date.today()
        future_60 = today + datetime.timedelta(days=60)
        future_30 = today + datetime.timedelta(days=30)

        expiring_leases = Lease.objects.filter(
            status='active',
            end_date__lte=future_60,
            end_date__gte=today,
        ).select_related('tenant', 'property')

        managers = list(User.objects.filter(role__in=['admin', 'manager']))

        for lease in expiring_leases:
            days_left = (lease.end_date - today).days
            priority = 'urgent' if days_left <= 30 else 'high'
            msg = (
                f"Lease for {lease.tenant.get_full_name() or lease.tenant.username} "
                f"at {lease.property.name} expires in {days_left} days ({lease.end_date})."
            )
            existing = Notification.objects.filter(
                notification_type='lease_expiring',
                related_object_id=lease.pk,
                is_read=False,
            )
            if not existing.exists():
                for user in [lease.tenant] + managers:
                    Notification.objects.create(
                        user=user,
                        notification_type='lease_expiring',
                        priority=priority,
                        title=f'Lease Expiring in {days_left} Days',
                        message=msg,
                        link='/leases',
                        related_object_id=lease.pk,
                    )
                    created += 1

        # Overdue invoices
        from rent.models import Invoice
        overdue_invoices = Invoice.objects.filter(
            status='overdue'
        ).select_related('tenant', 'property')

        for inv in overdue_invoices:
            existing = Notification.objects.filter(
                notification_type='rent_overdue',
                related_object_id=inv.pk,
                is_read=False,
            )
            if not existing.exists():
                days_overdue = (today - inv.due_date).days
                msg = (
                    f"Invoice {inv.invoice_number} for ${inv.total_amount - inv.paid_amount:.2f} "
                    f"is {days_overdue} days overdue."
                )
                for user in [inv.tenant] + managers:
                    Notification.objects.create(
                        user=user,
                        notification_type='rent_overdue',
                        priority='urgent',
                        title=f'Rent Overdue — {inv.invoice_number}',
                        message=msg,
                        link='/rent',
                        related_object_id=inv.pk,
                    )
                    created += 1

        # Emergency work orders
        from maintenance.models import WorkOrder
        emergency_wos = WorkOrder.objects.filter(
            priority='emergency',
            status__in=['open', 'assigned']
        ).select_related('property', 'reported_by')

        for wo in emergency_wos:
            existing = Notification.objects.filter(
                notification_type='work_order_update',
                related_object_id=wo.pk,
                is_read=False,
            )
            if not existing.exists():
                for user in managers:
                    Notification.objects.create(
                        user=user,
                        notification_type='work_order_update',
                        priority='urgent',
                        title=f'Emergency Work Order — {wo.property.name}',
                        message=f'{wo.title} at {wo.property.name} is marked EMERGENCY and unresolved.',
                        link='/maintenance',
                        related_object_id=wo.pk,
                    )
                    created += 1

        return Response({'created': created, 'message': f'{created} notifications generated'})
