"""Seed Zimbabwe comparables, inspections, disbursements and exchange rate."""
import os
import django
import datetime
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from valuation.models import SalesComparablesDB
from lettings.models import PropertyInspection, LandlordDisbursement
from properties.models import Property
from leases.models import Lease
from users.models import User
from currency.models import ExchangeRate

admin = User.objects.filter(username='admin').first()
manager = User.objects.filter(username='manager').first()

# Exchange Rate
rate, _ = ExchangeRate.objects.get_or_create(
    date=datetime.date.today(), source='rbz',
    defaults=dict(usd_to_zig=Decimal('13.7400'), set_by=admin,
                  notes='RBZ official rate — June 2025', is_active=True)
)
print(f"Rate: 1 USD = {rate.usd_to_zig} ZiG")

# Sales Comparables Database
SalesComparablesDB.objects.all().delete()
comps = [
    ('14A Crowhill Rd', 'Borrowdale', 'Harare', 'residential', 'freehold', 1200, 280, 4, 3, 2, 'good', 330000, datetime.date(2025, 4, 10), 45, True, 'agent_confirmed'),
    ('7 Hellensvale Drive', 'Borrowdale', 'Harare', 'residential', 'freehold', 1100, 260, 4, 3, 2, 'excellent', 355000, datetime.date(2025, 3, 22), 38, True, 'deeds_registry'),
    ('22 Plovers Hill', 'Borrowdale', 'Harare', 'residential', 'freehold', 900, 210, 3, 2, 1, 'good', 290000, datetime.date(2025, 2, 14), 52, True, 'agent_confirmed'),
    ('31 Alexandra Ave', 'Highlands', 'Harare', 'residential', 'freehold', 800, 180, 3, 2, 1, 'good', 240000, datetime.date(2025, 5, 1), 60, False, 'newspaper'),
    ('15 Holt Road', 'Highlands', 'Harare', 'residential', 'freehold', 1500, 380, 5, 4, 2, 'excellent', 490000, datetime.date(2025, 1, 18), 35, True, 'own_sale'),
    ('9 King George Rd', 'Avondale', 'Harare', 'residential', 'freehold', 650, 120, 2, 1, 1, 'fair', 85000, datetime.date(2025, 4, 25), 72, True, 'deeds_registry'),
    ('3 Fourth St', 'Avondale', 'Harare', 'residential', 'freehold', 700, 130, 2, 1, 1, 'good', 100000, datetime.date(2025, 3, 10), 48, True, 'agent_confirmed'),
    ('18 Quorn Ave', 'Mount Pleasant', 'Harare', 'residential', 'freehold', 900, 240, 4, 3, 2, 'good', 260000, datetime.date(2025, 5, 15), 41, True, 'deeds_registry'),
    ('5 Lanark Rd', 'Belgravia', 'Harare', 'residential', 'freehold', 750, 170, 3, 2, 1, 'good', 195000, datetime.date(2025, 2, 28), 55, True, 'own_sale'),
    ('11 Enterprise Rd', 'Highlands', 'Harare', 'commercial', 'freehold', 2000, 450, 0, 2, 4, 'good', 620000, datetime.date(2025, 1, 30), 90, True, 'deeds_registry'),
    ('Unit 3 Coventry Rd Ind Park', 'Graniteside', 'Harare', 'industrial', 'freehold', 3000, 800, 0, 2, 8, 'good', 380000, datetime.date(2024, 12, 10), 120, True, 'agent_confirmed'),
    ('Stand 112 Borrowdale', 'Borrowdale', 'Harare', 'land', 'freehold', 1200, 0, 0, 0, 0, 'good', 145000, datetime.date(2025, 4, 5), 30, True, 'deeds_registry'),
    ('Stand 45 Pomona', 'Pomona', 'Harare', 'land', 'freehold', 2000, 0, 0, 0, 0, 'good', 180000, datetime.date(2025, 3, 20), 45, False, 'newspaper'),
    ('22 Cecil Ave', 'Suburbs', 'Bulawayo', 'residential', 'freehold', 800, 145, 3, 2, 1, 'good', 72000, datetime.date(2025, 2, 10), 65, True, 'agent_confirmed'),
    ('7 Hillside Drive', 'Hillside', 'Bulawayo', 'residential', 'freehold', 900, 175, 3, 2, 1, 'good', 88000, datetime.date(2025, 1, 25), 80, True, 'deeds_registry'),
    ('3 Herbert Chitepo St', 'Sakubva', 'Mutare', 'residential', 'freehold', 600, 130, 3, 2, 1, 'fair', 52000, datetime.date(2025, 3, 5), 90, True, 'agent_confirmed'),
    ('12 Robert Mugabe Rd', 'CBD', 'Mutare', 'commercial', 'leasehold', 1500, 350, 0, 3, 5, 'fair', 210000, datetime.date(2024, 11, 20), 150, False, 'other_valuer'),
    ('Flat 3A Baines House', 'Belgravia', 'Harare', 'residential', 'sectional_title', 0, 110, 2, 1, 1, 'excellent', 120000, datetime.date(2025, 5, 10), 28, True, 'own_sale'),
    ('Flat 5B Highlands Place', 'Highlands', 'Harare', 'residential', 'sectional_title', 0, 95, 2, 1, 0, 'good', 95000, datetime.date(2025, 4, 18), 33, True, 'deeds_registry'),
    ('6 Bromley Rd', 'Greendale', 'Harare', 'residential', 'freehold', 1100, 220, 4, 3, 2, 'good', 220000, datetime.date(2025, 3, 30), 50, True, 'agent_confirmed'),
    ('23 Greystone Drive', 'Greystone Park', 'Harare', 'residential', 'freehold', 2500, 450, 5, 4, 3, 'excellent', 560000, datetime.date(2025, 2, 5), 40, True, 'deeds_registry'),
    ('17 Kumalo Rd', 'Kumalo', 'Bulawayo', 'residential', 'freehold', 1100, 200, 4, 2, 2, 'good', 95000, datetime.date(2025, 3, 12), 55, True, 'agent_confirmed'),
    ('Stand 88 Glen Lorne', 'Glen Lorne', 'Harare', 'land', 'freehold', 4000, 0, 0, 0, 0, 'good', 320000, datetime.date(2025, 4, 28), 25, True, 'deeds_registry'),
    ('Unit 7 Msasa Park', 'Msasa', 'Harare', 'industrial', 'leasehold', 5000, 1200, 0, 4, 10, 'fair', 450000, datetime.date(2025, 1, 8), 200, True, 'deeds_registry'),
]

for (addr, sub, city, ptype, tenure, land, floor, beds, baths, garages,
     cond, price, date, dom, verified, source) in comps:
    SalesComparablesDB.objects.create(
        address=addr, suburb=sub, city=city, property_type=ptype, tenure=tenure,
        land_size_sqm=land, floor_area_sqm=floor, bedrooms=beds, bathrooms=baths,
        garages=garages, condition=cond, sale_price_usd=price, sale_date=date,
        days_on_market=dom, verified=verified, source=source, added_by=admin,
    )
print(f"Created {SalesComparablesDB.objects.count()} sales comparables")

# Property Inspections
PropertyInspection.objects.all().delete()
props = list(Property.objects.all())
leases = list(Lease.objects.filter(status='active'))

inspection_data = [
    (0, 0, 'routine', datetime.date(2025, 7, 15), 'scheduled', False, 'na', False, ''),
    (1, 1, 'move_in', datetime.date(2025, 5, 28), 'completed', True, 'good', False, 'Property clean and in good order. All fixtures working.'),
    (2, 2, 'annual', datetime.date(2025, 8, 1), 'scheduled', True, 'na', False, ''),
    (3, -1, 'pre_sale', datetime.date(2025, 6, 18), 'overdue', False, 'na', True, ''),
    (0, 0, 'move_out', datetime.date(2026, 12, 31), 'scheduled', False, 'na', False, ''),
]

for pidx, lidx, itype, sdate, status, notified, condition, action, summary in inspection_data:
    if pidx < len(props):
        lease = leases[lidx] if 0 <= lidx < len(leases) else None
        PropertyInspection.objects.create(
            property=props[pidx], lease=lease, inspection_type=itype,
            scheduled_date=sdate, status=status, inspector=manager,
            tenant_notified=notified, overall_condition=condition,
            action_required=action, report_summary=summary,
        )
print(f"Created {PropertyInspection.objects.count()} inspections")

# Landlord Disbursements
LandlordDisbursement.objects.all().delete()
for prop in props[:4]:
    owner = prop.owner or admin
    for month in [3, 4, 5]:
        gross = float(prop.monthly_rent or 1000)
        LandlordDisbursement.objects.create(
            property=prop, owner=owner,
            period_month=month, period_year=2025,
            gross_rent_usd=gross,
            agent_commission_rate=10,
            exchange_rate=rate,
            generated_by=admin,
            status='paid' if month < 5 else 'draft',
            paid_date=datetime.date(2025, month + 1, 5) if month < 5 else None,
            payment_method='Bank Transfer' if month < 5 else '',
        )
print(f"Created {LandlordDisbursement.objects.count()} disbursements")
print("\nAll new seed data created successfully!")
