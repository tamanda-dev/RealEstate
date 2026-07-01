from rest_framework.routers import DefaultRouter
from .views import VendorViewSet, WorkOrderViewSet, MaintenanceExpenseViewSet, PreventiveScheduleViewSet

router = DefaultRouter()
router.register('vendors', VendorViewSet, basename='vendors')
router.register('work-orders', WorkOrderViewSet, basename='work-orders')
router.register('expenses', MaintenanceExpenseViewSet, basename='expenses')
router.register('preventive-schedules', PreventiveScheduleViewSet, basename='preventive-schedules')

urlpatterns = router.urls
