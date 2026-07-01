from rest_framework.routers import DefaultRouter
from .views import (ValuationViewSet, ComparableViewSet, PriceTrendViewSet,
                    SalesComparablesDBViewSet, ValuationMethodologyViewSet)

router = DefaultRouter()
router.register('sales-comparables', SalesComparablesDBViewSet, basename='sales-comparables')
router.register('methodologies', ValuationMethodologyViewSet, basename='methodologies')
router.register('valuations', ValuationViewSet, basename='valuations')
router.register('comparables', ComparableViewSet, basename='comparables')
router.register('price-trends', PriceTrendViewSet, basename='price-trends')

urlpatterns = router.urls
