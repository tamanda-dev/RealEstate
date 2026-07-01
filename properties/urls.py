from rest_framework.routers import DefaultRouter
from .views import PropertyViewSet, PropertyImageViewSet, UnitViewSet

router = DefaultRouter()
router.register('images', PropertyImageViewSet, basename='property-images')
router.register('units', UnitViewSet, basename='units')
router.register('', PropertyViewSet, basename='properties')

urlpatterns = router.urls
