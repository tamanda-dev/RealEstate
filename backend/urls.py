from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/users/', include('users.urls')),
    path('api/properties/', include('properties.urls')),
    path('api/rent/', include('rent.urls')),
    path('api/leases/', include('leases.urls')),
    path('api/maintenance/', include('maintenance.urls')),
    path('api/sales/', include('sales.urls')),
    path('api/valuation/', include('valuation.urls')),
    path('api/accounting/', include('accounting.urls')),
    path('api/expenses/', include('expenses.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/crm/', include('crm.urls')),
    path('api/currency/', include('currency.urls')),
    path('api/bookings/', include('bookings.urls')),
    path('api/documents/', include('documents.urls')),
    path('api/whatsapp/', include('whatsapp_integration.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/lettings/', include('lettings.urls')),
    path('api/portal/', include('portal.urls')),
    path('api/aml/', include('aml.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
