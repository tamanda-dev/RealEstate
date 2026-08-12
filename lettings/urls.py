from rest_framework.routers import DefaultRouter
from .views import (PropertyInspectionViewSet, InspectionChecklistItemViewSet,
                     InspectionPhotoViewSet, LandlordDisbursementViewSet, BulkPaymentBatchViewSet)

router = DefaultRouter()
router.register('inspections', PropertyInspectionViewSet, basename='inspections')
router.register('inspection-checklist-items', InspectionChecklistItemViewSet, basename='inspection-checklist-items')
router.register('inspection-photos', InspectionPhotoViewSet, basename='inspection-photos')
router.register('disbursements', LandlordDisbursementViewSet, basename='disbursements')
router.register('bulk-payment-batches', BulkPaymentBatchViewSet, basename='bulk-payment-batches')

urlpatterns = router.urls
