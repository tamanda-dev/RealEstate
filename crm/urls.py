from rest_framework.routers import DefaultRouter
from .views import PipelineStageViewSet, LeadViewSet, OpportunityViewSet, InteractionViewSet, CampaignViewSet

router = DefaultRouter()
router.register('stages', PipelineStageViewSet, basename='pipeline-stages')
router.register('leads', LeadViewSet, basename='leads')
router.register('opportunities', OpportunityViewSet, basename='opportunities')
router.register('interactions', InteractionViewSet, basename='interactions')
router.register('campaigns', CampaignViewSet, basename='campaigns')

urlpatterns = router.urls
