from rest_framework.routers import DefaultRouter
from .views import EmailMessageViewSet, SMSMessageViewSet

router = DefaultRouter()
router.register('email', EmailMessageViewSet, basename='email-messages')
router.register('sms', SMSMessageViewSet, basename='sms-messages')

urlpatterns = router.urls
