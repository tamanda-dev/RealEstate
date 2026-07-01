from rest_framework.routers import DefaultRouter
from .views import (SavedListingViewSet, ViewingRequestViewSet, BuyerOfferViewSet,
                    AgentKPIViewSet, DiscountApprovalViewSet)

router = DefaultRouter()
router.register('saved-listings',   SavedListingViewSet,    basename='saved-listings')
router.register('viewing-requests', ViewingRequestViewSet,  basename='viewing-requests')
router.register('buyer-offers',     BuyerOfferViewSet,      basename='buyer-offers')
router.register('agent-kpis',       AgentKPIViewSet,        basename='agent-kpis')
router.register('discount-approvals', DiscountApprovalViewSet, basename='discount-approvals')

urlpatterns = router.urls
