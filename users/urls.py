from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (UserViewSet, PasswordResetRequestView, PasswordResetConfirmView,
                     PasswordResetOTPConfirmView)

router = DefaultRouter()
router.register('', UserViewSet, basename='users')

urlpatterns = [
    path('password-reset/', PasswordResetRequestView.as_view(), name='password_reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('password-reset/confirm-otp/', PasswordResetOTPConfirmView.as_view(), name='password_reset_confirm_otp'),
] + router.urls
