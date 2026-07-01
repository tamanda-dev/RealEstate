from rest_framework.routers import DefaultRouter
from .views import ExpenseCategoryViewSet, OperatingExpenseViewSet, ExpenseBudgetViewSet

router = DefaultRouter()
router.register('categories', ExpenseCategoryViewSet, basename='expense-categories')
router.register('budgets', ExpenseBudgetViewSet, basename='expense-budgets')
router.register('', OperatingExpenseViewSet, basename='expenses')

urlpatterns = router.urls
