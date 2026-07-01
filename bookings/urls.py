from rest_framework.routers import DefaultRouter
from .views import QuotationViewSet, ReservationViewSet, HandoverChecklistViewSet, HandoverItemViewSet

router = DefaultRouter()
router.register('quotations', QuotationViewSet, basename='quotations')
router.register('reservations', ReservationViewSet, basename='reservations')
router.register('handovers', HandoverChecklistViewSet, basename='handovers')
router.register('handover-items', HandoverItemViewSet, basename='handover-items')

urlpatterns = router.urls
