from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import WhatsAppConfigViewSet, WhatsAppTemplateViewSet, WhatsAppMessageViewSet, whatsapp_webhook

router = DefaultRouter()
router.register('config', WhatsAppConfigViewSet, basename='whatsapp-config')
router.register('templates', WhatsAppTemplateViewSet, basename='whatsapp-templates')
router.register('messages', WhatsAppMessageViewSet, basename='whatsapp-messages')

urlpatterns = router.urls + [
    path('webhook/', whatsapp_webhook, name='whatsapp-webhook'),
]
