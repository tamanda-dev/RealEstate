from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from .models import User
from .serializers import UserSerializer, UserCreateSerializer, UserUpdateSerializer


class IsAdminOrManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            'admin', 'manager', 'property_manager', 'agent', 'sales_manager',
        )


class IsAdminOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('-date_joined')
    search_fields = ['username', 'email', 'first_name', 'last_name', 'phone']
    filterset_fields = ['role', 'is_active']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == 'me':
            return [permissions.IsAuthenticated()]
        if self.action in ['list', 'retrieve', 'tenants']:
            return [IsAdminOrManager()]
        # create, update, destroy require admin
        return [IsAdminOnly()]

    # ── Read endpoints ────────────────────────────────────────────────────────

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        return Response(UserSerializer(request.user).data)

    @action(detail=False, methods=['get'], permission_classes=[IsAdminOrManager])
    def tenants(self, request):
        qs = User.objects.filter(role='tenant', is_active=True)
        return Response(UserSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], permission_classes=[IsAdminOrManager])
    def by_role(self, request):
        from django.db.models import Count
        breakdown = (
            User.objects.values('role')
            .annotate(count=Count('id'))
            .order_by('role')
        )
        return Response(list(breakdown))

    # ── Write endpoints (admin only) ──────────────────────────────────────────

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOnly])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
            return Response({'error': 'You cannot deactivate your own account.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response({'message': f'{user.username} has been deactivated.'})

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOnly])
    def activate(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=['is_active'])
        return Response({'message': f'{user.username} has been activated.'})

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOnly])
    def change_role(self, request, pk=None):
        user = self.get_object()
        new_role = request.data.get('role')
        valid_roles = [r[0] for r in User.ROLE_CHOICES]
        if new_role not in valid_roles:
            return Response({'error': f'Invalid role. Choose from: {valid_roles}'},
                            status=status.HTTP_400_BAD_REQUEST)
        if user == request.user and new_role != 'admin':
            return Response({'error': 'You cannot remove your own admin role.'},
                            status=status.HTTP_400_BAD_REQUEST)
        old_role = user.role
        user.role = new_role
        user.save(update_fields=['role'])
        return Response({
            'message': f'{user.username} role changed from {old_role} to {new_role}.',
            'user': UserSerializer(user).data,
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOnly])
    def reset_password(self, request, pk=None):
        user = self.get_object()
        new_password = request.data.get('new_password', '')
        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save()
        return Response({'message': f'Password for {user.username} has been reset.'})

    @action(detail=False, methods=['get'], permission_classes=[IsAdminOrManager])
    def dashboard_stats(self, request):
        from django.db.models import Count
        total = User.objects.count()
        active = User.objects.filter(is_active=True).count()
        by_role = {
            item['role']: item['count']
            for item in User.objects.values('role').annotate(count=Count('id'))
        }
        return Response({
            'total': total,
            'active': active,
            'inactive': total - active,
            'by_role': by_role,
        })
