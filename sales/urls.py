from rest_framework.routers import DefaultRouter
from .views import ListingViewSet, ContactViewSet, OfferViewSet, CommissionStructureViewSet, TransactionViewSet

router = DefaultRouter()
router.register('listings', ListingViewSet, basename='listings')
router.register('contacts', ContactViewSet, basename='contacts')
router.register('offers', OfferViewSet, basename='offers')
router.register('commissions', CommissionStructureViewSet, basename='commissions')
router.register('transactions', TransactionViewSet, basename='transactions')

urlpatterns = router.urls
