from rest_framework.routers import DefaultRouter
from .views import CompanySettingsViewSet

router = DefaultRouter()
router.register('', CompanySettingsViewSet, basename='company-settings')

urlpatterns = router.urls
