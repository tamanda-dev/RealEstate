import re

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from backend.sms import send_sms, to_e164
from .models import User, PasswordResetOTP
from .serializers import (UserSerializer, UserCreateSerializer, UserUpdateSerializer,
                           SelfProfileUpdateSerializer)


def _find_user_by_phone(phone):
    """Match on the last 9 significant digits rather than requiring an exact stored format —
    User.phone has no enforced format (see users/models.py), so the same number might be on
    file as '0771234567', '+263771234567', or '263771234567'. All of those share a suffix."""
    digits = re.sub(r'\D', '', phone or '')
    significant = digits[-9:] if len(digits) >= 9 else digits
    if len(significant) < 7:
        return None
    return User.objects.filter(is_active=True, phone__endswith=significant).exclude(phone='').first()


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

    @action(detail=False, methods=['get', 'patch'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        if request.method == 'PATCH':
            # Deliberately uses SelfProfileUpdateSerializer, not UserUpdateSerializer —
            # a user editing their own profile must never be able to change their own
            # role or is_active (that stays admin-only via the regular update endpoint).
            serializer = SelfProfileUpdateSerializer(request.user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
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


class PasswordResetRequestView(APIView):
    """Public endpoint: emails a reset link (given an email) or texts an OTP code (given a
    phone) if the identifier matches an active account.

    Always returns the same generic message regardless of whether it matched, so this can't
    be used to enumerate which emails/phones have accounts.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        email = (request.data.get('email') or '').strip()
        phone = (request.data.get('phone') or '').strip()
        if not email and not phone:
            return Response({'error': 'Email or phone is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if phone:
            return self._handle_phone(phone)
        return self._handle_email(email)

    def _handle_email(self, email):
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"
            send_mail(
                subject='Reset your password',
                message=(
                    f"Hi {user.get_full_name() or user.username},\n\n"
                    "We received a request to reset your password. Click the link "
                    f"below to choose a new one:\n\n{reset_link}\n\n"
                    "If you didn't request this, you can safely ignore this email "
                    "— your password will not change."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
        return Response({
            'message': 'If an account with that email exists, a password reset link has been sent.'
        })

    def _handle_phone(self, phone):
        user = _find_user_by_phone(phone)
        if user and to_e164(user.phone):
            otp = PasswordResetOTP.generate_for(user)
            send_sms(
                user.phone,
                f"Your PropManager ZW password reset code is {otp.code}. It expires in "
                f"{PasswordResetOTP.OTP_TTL_MINUTES} minutes. If you didn't request this, ignore this message.",
            )
        return Response({
            'message': 'If an account with that phone number exists, a reset code has been sent by SMS.'
        })


class PasswordResetConfirmView(APIView):
    """Public endpoint: sets a new password given a valid uid/token pair from the email link."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        uid = request.data.get('uid') or ''
        token = request.data.get('token') or ''
        new_password = request.data.get('new_password') or ''

        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None

        if user is None or not default_token_generator.check_token(user, token):
            return Response({'error': 'This password reset link is invalid or has expired.'},
                            status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        return Response({'message': 'Your password has been reset successfully. You can now log in.'})


class PasswordResetOTPConfirmView(APIView):
    """Public endpoint: sets a new password given a valid phone/code pair from the SMS OTP flow."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        phone = (request.data.get('phone') or '').strip()
        code = (request.data.get('code') or '').strip()
        new_password = request.data.get('new_password') or ''

        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'},
                            status=status.HTTP_400_BAD_REQUEST)

        invalid_response = Response({'error': 'That code is invalid or has expired.'},
                                     status=status.HTTP_400_BAD_REQUEST)

        user = _find_user_by_phone(phone)
        if not user:
            return invalid_response

        otp = PasswordResetOTP.objects.filter(user=user, is_used=False).order_by('-created_at').first()
        if not otp or not otp.is_valid():
            return invalid_response

        if otp.code != code:
            otp.attempts += 1
            otp.save(update_fields=['attempts'])
            return invalid_response

        otp.is_used = True
        otp.save(update_fields=['is_used'])
        user.set_password(new_password)
        user.save()
        return Response({'message': 'Your password has been reset successfully. You can now log in.'})
