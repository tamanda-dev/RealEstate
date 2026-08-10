from rest_framework.routers import DefaultRouter

from .views import (KYCProfileViewSet, MonitoredTransactionViewSet,
                     BeneficialOwnerViewSet, WatchlistEntryViewSet)

router = DefaultRouter()
router.register('kyc-profiles', KYCProfileViewSet, basename='kyc-profiles')
router.register('monitored-transactions', MonitoredTransactionViewSet, basename='monitored-transactions')
router.register('beneficial-owners', BeneficialOwnerViewSet, basename='beneficial-owners')
router.register('watchlist-entries', WatchlistEntryViewSet, basename='watchlist-entries')

urlpatterns = router.urls
