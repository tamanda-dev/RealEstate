from rest_framework.routers import DefaultRouter
from .views import (LeaseViewSet, LeaseClauseViewSet, LeaseRenewalViewSet,
                     SecurityDepositViewSet, DepositDeductionViewSet, GuarantorViewSet)

router = DefaultRouter()
router.register('clauses', LeaseClauseViewSet, basename='clauses')
router.register('renewals', LeaseRenewalViewSet, basename='renewals')
router.register('deposits', SecurityDepositViewSet, basename='deposits')
router.register('deposit-deductions', DepositDeductionViewSet, basename='deposit-deductions')
router.register('guarantors', GuarantorViewSet, basename='guarantors')
router.register('', LeaseViewSet, basename='leases')

urlpatterns = router.urls
