from rest_framework.routers import DefaultRouter
from .views import (AccountViewSet, JournalEntryViewSet, TrustTransactionViewSet,
                    ReconciliationViewSet, AuditLogViewSet,
                    BankStatementImportViewSet, BankStatementLineViewSet, ReceiptViewSet)

router = DefaultRouter()
router.register('accounts', AccountViewSet, basename='accounts')
router.register('journal-entries', JournalEntryViewSet, basename='journal-entries')
router.register('trust-transactions', TrustTransactionViewSet, basename='trust-transactions')
router.register('reconciliations', ReconciliationViewSet, basename='reconciliations')
router.register('audit-logs', AuditLogViewSet, basename='audit-logs')
router.register('statement-imports', BankStatementImportViewSet, basename='statement-imports')
router.register('statement-lines', BankStatementLineViewSet, basename='statement-lines')
router.register('receipts', ReceiptViewSet, basename='receipts')

urlpatterns = router.urls
