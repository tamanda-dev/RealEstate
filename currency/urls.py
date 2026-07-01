from rest_framework.routers import DefaultRouter
from .views import ExchangeRateViewSet

router = DefaultRouter()
router.register('rates', ExchangeRateViewSet, basename='exchange-rates')

urlpatterns = router.urls
