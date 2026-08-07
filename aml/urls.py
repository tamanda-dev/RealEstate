from rest_framework.routers import DefaultRouter

from .views import KYCProfileViewSet, MonitoredTransactionViewSet

router = DefaultRouter()
router.register('kyc-profiles', KYCProfileViewSet, basename='kyc-profiles')
router.register('monitored-transactions', MonitoredTransactionViewSet, basename='monitored-transactions')

urlpatterns = router.urls
