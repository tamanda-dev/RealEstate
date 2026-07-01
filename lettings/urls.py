from rest_framework.routers import DefaultRouter
from .views import PropertyInspectionViewSet, LandlordDisbursementViewSet

router = DefaultRouter()
router.register('inspections', PropertyInspectionViewSet, basename='inspections')
router.register('disbursements', LandlordDisbursementViewSet, basename='disbursements')

urlpatterns = router.urls
