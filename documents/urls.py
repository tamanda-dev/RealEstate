from rest_framework.routers import DefaultRouter
from .views import PropertyDocumentViewSet

router = DefaultRouter()
router.register('', PropertyDocumentViewSet, basename='documents')

urlpatterns = router.urls
