from rest_framework.routers import DefaultRouter
from .views import LeaseViewSet, LeaseClauseViewSet, LeaseRenewalViewSet

router = DefaultRouter()
router.register('clauses', LeaseClauseViewSet, basename='clauses')
router.register('renewals', LeaseRenewalViewSet, basename='renewals')
router.register('', LeaseViewSet, basename='leases')

urlpatterns = router.urls
