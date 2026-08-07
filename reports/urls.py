from django.urls import path
from .views import (aging_report, pl_report, agent_performance, cash_flow_forecast,
                    inventory_report, tenant_ledger, landlord_ledger, vat_zimra_report,
                    commission_trends, rent_per_sqm_report, market_price_analysis,
                    trial_balance, balance_sheet, rent_statement, distribute_rent_statement,
                    rent_roll)

urlpatterns = [
    path('aging/', aging_report, name='aging-report'),
    path('pl/', pl_report, name='pl-report'),
    path('agent-performance/', agent_performance, name='agent-performance'),
    path('cash-flow/', cash_flow_forecast, name='cash-flow-forecast'),
    path('inventory/', inventory_report, name='inventory-report'),
    path('tenant-ledger/', tenant_ledger, name='tenant-ledger'),
    path('landlord-ledger/', landlord_ledger, name='landlord-ledger'),
    path('vat-zimra/', vat_zimra_report, name='vat-zimra'),
    path('commission-trends/', commission_trends, name='commission-trends'),
    path('rent-per-sqm/', rent_per_sqm_report, name='rent-per-sqm'),
    path('market-price-analysis/', market_price_analysis, name='market-price-analysis'),
    path('trial-balance/', trial_balance, name='trial-balance'),
    path('balance-sheet/', balance_sheet, name='balance-sheet'),
    path('rent-statement/', rent_statement, name='rent-statement'),
    path('rent-statement/distribute/', distribute_rent_statement, name='rent-statement-distribute'),
    path('rent-roll/', rent_roll, name='rent-roll'),
]
