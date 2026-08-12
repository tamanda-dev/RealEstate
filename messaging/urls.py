from rest_framework.routers import DefaultRouter
from .views import EmailMessageViewSet, SMSMessageViewSet, EmailTemplateViewSet

router = DefaultRouter()
router.register('email', EmailMessageViewSet, basename='email-messages')
router.register('sms', SMSMessageViewSet, basename='sms-messages')
router.register('email-templates', EmailTemplateViewSet, basename='email-templates')

urlpatterns = router.urls
