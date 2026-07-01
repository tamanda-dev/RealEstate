from rest_framework.routers import DefaultRouter
from .views import InvoiceViewSet, PaymentViewSet, LateFeeRuleViewSet

router = DefaultRouter()
router.register('invoices', InvoiceViewSet, basename='invoices')
router.register('payments', PaymentViewSet, basename='payments')
router.register('late-fee-rules', LateFeeRuleViewSet, basename='late-fee-rules')

urlpatterns = router.urls
