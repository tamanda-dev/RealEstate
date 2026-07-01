"""
Zimbabwe Real Estate Seed Data
Run with: python seed_data.py
Currency: USD (Zimbabwe's primary operating currency)
"""
import os
import django
import datetime
import random

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from users.models import User
from properties.models import Property, Unit
from rent.models import Invoice, LateFeeRule
from leases.models import Lease, LeaseClause
from maintenance.models import Vendor, WorkOrder, MaintenanceExpense
from sales.models import Listing, Contact, CommissionStructure, Offer
from valuation.models import PriceTrend, Valuation, Comparable
from accounting.models import Account
from expenses.models import ExpenseCategory, OperatingExpense
from notifications.models import Notification


def clear_data():
    print("Clearing existing data...")
    Notification.objects.all().delete()
    OperatingExpense.objects.all().delete()
    MaintenanceExpense.objects.all().delete()
    WorkOrder.objects.all().delete()
    Vendor.objects.all().delete()
    Offer.objects.all().delete()
    Listing.objects.all().delete()
    Contact.objects.all().delete()
    CommissionStructure.objects.all().delete()
    Comparable.objects.all().delete()
    Valuation.objects.all().delete()
    PriceTrend.objects.all().delete()
    Invoice.objects.all().delete()
    LateFeeRule.objects.all().delete()
    Lease.objects.all().delete()
    LeaseClause.objects.all().delete()
    Unit.objects.all().delete()
    Property.objects.all().delete()
    Account.objects.all().delete()
    ExpenseCategory.objects.all().delete()
    User.objects.filter(is_superuser=False).delete()


def run():
    clear_data()

    # ── USERS ─────────────────────────────────────────────────────────────────
    print("Creating users...")

    admin, _ = User.objects.get_or_create(username='admin', defaults=dict(
        email='admin@propzim.co.zw', first_name='Tendai', last_name='Moyo',
        phone='+263 77 123 4567', role='admin', is_staff=True, is_superuser=True))
    admin.set_password('admin123')
    admin.save()

    manager, _ = User.objects.get_or_create(username='manager', defaults=dict(
        email='ruvimbo.dube@propzim.co.zw', role='manager',
        first_name='Ruvimbo', last_name='Dube', phone='+263 71 234 5678'))
    manager.set_password('manager123')
    manager.save()

    agent, _ = User.objects.get_or_create(username='agent', defaults=dict(
        email='farai.ncube@propzim.co.zw', role='agent',
        first_name='Farai', last_name='Ncube', phone='+263 73 345 6789'))
    agent.set_password('agent123')
    agent.save()

    accountant, _ = User.objects.get_or_create(username='accountant', defaults=dict(
        email='chipo.mutasa@propzim.co.zw', role='accountant',
        first_name='Chipo', last_name='Mutasa', phone='+263 78 456 7890'))
    accountant.set_password('accountant123')
    accountant.save()

    tenant_data = [
        ('Simba',    'Ndlovu',     'simba.ndlovu@gmail.com',     '+263 77 111 2222'),
        ('Tatenda',  'Sibanda',    'tatenda.sibanda@gmail.com',  '+263 71 222 3333'),
        ('Chiedza',  'Mpofu',      'chiedza.mpofu@gmail.com',    '+263 73 333 4444'),
        ('Tawanda',  'Gumbo',      'tawanda.gumbo@gmail.com',    '+263 78 444 5555'),
        ('Nyaradzo', 'Chidziva',   'nyaradzo.chidziva@gmail.com','+263 77 555 6666'),
    ]
    tenants = []
    for i, (fn, ln, email, phone) in enumerate(tenant_data):
        t, _ = User.objects.get_or_create(username=f'tenant{i+1}', defaults=dict(
            email=email, role='tenant', first_name=fn, last_name=ln, phone=phone))
        t.set_password('tenant123')
        t.save()
        tenants.append(t)

    # ── PROPERTIES ────────────────────────────────────────────────────────────
    print("Creating properties...")

    prop_data = [
        # (name, type, address, city, suburb/state, beds, baths, sqft, rent, value, status)
        (
            'Borrowdale Brooke Townhouse',
            'residential',
            '14 Borrowdale Road',
            'Harare', 'Borrowdale',
            4, 3, 220, 1800, 320000, 'rented'
        ),
        (
            'Avondale Garden Flat',
            'residential',
            '7 King George Road',
            'Harare', 'Avondale',
            2, 1, 110, 750, 95000, 'rented'
        ),
        (
            'Highlands Executive Home',
            'residential',
            '32 Holt Road',
            'Harare', 'Highlands',
            5, 4, 380, 2500, 480000, 'rented'
        ),
        (
            'Eastgate Commercial Suite',
            'commercial',
            '3rd Floor, Eastgate Shopping Centre, Robert Mugabe Road',
            'Harare', 'CBD',
            0, 2, 180, 2200, 310000, 'rented'
        ),
        (
            'Bulawayo Suburbs Cottage',
            'residential',
            '45 Cecil Avenue',
            'Bulawayo', 'Suburbs',
            3, 2, 145, 620, 75000, 'available'
        ),
        (
            'Mount Pleasant Stand',
            'residential',
            '21 Quorn Avenue',
            'Harare', 'Mount Pleasant',
            4, 3, 260, 1400, 250000, 'listed_for_sale'
        ),
        (
            'Greendale Industrial Unit',
            'commercial',
            'Unit 4, Coventry Road Industrial Park',
            'Harare', 'Greendale',
            0, 1, 420, 1800, 185000, 'rented'
        ),
        (
            'Mutare Townhouse',
            'residential',
            '8 Herbert Chitepo Street',
            'Mutare', 'Sakubva',
            3, 2, 130, 480, 58000, 'available'
        ),
    ]

    props = []
    for name, ptype, addr, city, state, bed, bath, sqm, rent, val, status in prop_data:
        p, _ = Property.objects.get_or_create(name=name, defaults=dict(
            owner=admin, manager=manager,
            property_type=ptype, status=status,
            address=addr, city=city, state=state,
            zip_code='', country='Zimbabwe',
            bedrooms=bed, bathrooms=bath,
            square_feet=sqm,       # stored as m² here
            monthly_rent=rent,
            current_value=val,
            purchase_price=round(val * 0.88),
            description=f'{name} — well-maintained property in {state}, {city}.',
            amenities=['Security', 'Borehole Water', 'Solar Power', 'Domestic Quarters']
                      if ptype == 'residential' else ['Security', '3-Phase Power', 'Loading Bay'],
        ))
        props.append(p)

    # Units for apartment blocks
    flat_data = [
        ('Flat 1A', 1, 1, 1, 65, 550),
        ('Flat 1B', 1, 2, 1, 65, 550),
        ('Flat 2A', 2, 2, 1, 80, 650),
        ('Flat 2B', 2, 2, 1, 80, 650),
        ('Flat 3A', 3, 3, 2, 120, 900),
    ]
    for unit_num, floor, beds, baths, sqm, rent in flat_data:
        Unit.objects.get_or_create(
            property=props[1], unit_number=unit_num,
            defaults=dict(floor=floor, bedrooms=beds, bathrooms=baths,
                          square_feet=sqm, monthly_rent=rent,
                          is_occupied=rent < 700))

    # ── LEASE CLAUSES ─────────────────────────────────────────────────────────
    print("Creating lease clauses...")

    clause_data = [
        ('Payment in USD', 'payment',
         'All rental payments shall be made in United States Dollars (USD). '
         'ZiG or RTGS payments are accepted at the prevailing Reserve Bank of Zimbabwe rate on date of payment.'),
        ('Water & Electricity Responsibility', 'utilities',
         'The tenant is responsible for all ZESA (electricity) and ZINWA/municipality water charges. '
         'Any arrears to utility providers remain the tenant\'s liability.'),
        ('No Subletting', 'subletting',
         'The tenant shall not sublet, assign or part with possession of the premises '
         'or any part thereof without prior written consent of the landlord.'),
        ('Pets Policy', 'pets',
         'No livestock, poultry or exotic animals permitted. '
         'One domestic dog or cat may be kept with written landlord approval and a refundable pet deposit of USD 200.'),
        ('Maintenance Threshold', 'maintenance',
         'The tenant is responsible for day-to-day maintenance costs not exceeding USD 50. '
         'All defects must be reported to the property manager within 48 hours of discovery.'),
        ('Early Termination', 'termination',
         'Either party may terminate this lease with 60 days written notice. '
         'Early termination by tenant forfeits one month\'s rental deposit.'),
        ('Security Deposit', 'payment',
         'A security deposit equivalent to two months\' rent is payable upon signing. '
         'Deposit is refundable within 14 days of vacation subject to inspection.'),
        ('Borehole Usage', 'general',
         'The borehole water supply is shared infrastructure. '
         'The tenant must not use borehole water for commercial purposes or irrigation beyond a standard garden.'),
    ]
    clauses = []
    for title, cat, content in clause_data:
        c, _ = LeaseClause.objects.get_or_create(title=title, defaults=dict(
            category=cat, content=content, is_standard=True))
        clauses.append(c)

    # ── LEASES ────────────────────────────────────────────────────────────────
    print("Creating leases...")

    lease_assignments = [
        (tenants[0], props[0], datetime.date(2025, 1, 1), datetime.date(2025, 12, 31)),
        (tenants[1], props[1], datetime.date(2025, 3, 1), datetime.date(2026, 2, 28)),
        (tenants[2], props[2], datetime.date(2024, 7, 1), datetime.date(2025, 6, 30)),  # expiring
        (tenants[3], props[3], datetime.date(2025, 2, 1), datetime.date(2026, 1, 31)),
        (tenants[4], props[6], datetime.date(2025, 4, 1), datetime.date(2026, 3, 31)),
    ]

    leases = []
    for tenant, prop, start, end in lease_assignments:
        l, _ = Lease.objects.get_or_create(tenant=tenant, property=prop, defaults=dict(
            start_date=start, end_date=end,
            monthly_rent=prop.monthly_rent,
            security_deposit=prop.monthly_rent * 2,
            status='active',
            signed_by_tenant=True, signed_by_landlord=True,
            renewal_reminder_days=60,
        ))
        l.clauses.set(clauses[:5])
        leases.append(l)

    # ── INVOICES ──────────────────────────────────────────────────────────────
    print("Creating invoices...")

    for lease in leases:
        for month in range(1, 7):
            if month > datetime.date.today().month and datetime.date.today().year == 2025:
                break
            period_start = datetime.date(2025, month, 1)
            due = datetime.date(2025, month, 5)
            paid = month < 5
            overdue = month == 4 and not paid

            inv, created = Invoice.objects.get_or_create(
                tenant=lease.tenant,
                property=lease.property,
                period_start=period_start,
                defaults=dict(
                    period_end=datetime.date(2025, month, 28),
                    due_date=due,
                    rent_amount=lease.monthly_rent,
                    total_amount=lease.monthly_rent,
                    paid_amount=lease.monthly_rent if paid else 0,
                    status='paid' if paid else 'overdue',
                ))

    # One partial payment invoice
    LateFeeRule.objects.get_or_create(
        name='Standard Late Fee (USD)',
        defaults=dict(
            grace_period_days=5,
            fee_type='flat',
            fee_amount=50,
            max_fee=200,
            is_active=True,
        ))

    # ── VENDORS ───────────────────────────────────────────────────────────────
    print("Creating vendors...")

    vendor_data = [
        ('ZimFix Plumbers', 'plumbing', '+263 77 201 3344', 'zimfix@plumbing.co.zw', 4.6),
        ('Econet PowerTech Electrical', 'electrical', '+263 71 302 4455', 'powertech@electric.co.zw', 4.4),
        ('Aircon Zimbabwe', 'hvac', '+263 73 403 5566', 'aircon@hvac.co.zw', 4.7),
        ('Ndlovu Painting Contractors', 'painting', '+263 78 504 6677', 'ndlovu.paint@gmail.com', 4.2),
        ('Green Cuts Landscaping', 'landscaping', '+263 77 605 7788', 'greencuts@landscaping.co.zw', 4.5),
        ('SparkClean Zimbabwe', 'cleaning', '+263 71 706 8899', 'sparkclean@cleaning.co.zw', 4.8),
        ('Securico Security Systems', 'general', '+263 73 807 9900', 'securico@security.co.zw', 4.9),
        ('Roofsmart Zimbabwe', 'roofing', '+263 78 908 0011', 'roofsmart@roofing.co.zw', 4.3),
    ]
    vendors = []
    for name, cat, phone, email, rating in vendor_data:
        v, _ = Vendor.objects.get_or_create(name=name, defaults=dict(
            category=cat, phone=phone, email=email,
            rating=rating, is_active=True,
            address='Harare, Zimbabwe'))
        vendors.append(v)

    # ── WORK ORDERS ───────────────────────────────────────────────────────────
    print("Creating work orders...")

    wo_data = [
        ('ZESA electricity tripping at DB board', 'electrical', 'emergency', 'in_progress', props[0], tenants[0], vendors[1], 180),
        ('Borehole pump not working', 'plumbing', 'high', 'assigned', props[0], tenants[0], vendors[0], 350),
        ('Solar inverter alarm beeping', 'electrical', 'high', 'open', props[2], tenants[2], None, 220),
        ('Leaking geyser in bathroom', 'plumbing', 'medium', 'open', props[1], tenants[1], None, 120),
        ('Exterior security light broken', 'electrical', 'medium', 'assigned', props[3], tenants[3], vendors[1], 80),
        ('Damp patches on lounge ceiling', 'structural', 'high', 'open', props[6], tenants[4], None, 600),
        ('Garden overgrown — needs cutting', 'other', 'low', 'completed', props[0], tenants[0], vendors[4], 60),
        ('Air conditioning unit servicing', 'hvac', 'low', 'completed', props[2], tenants[2], vendors[2], 150),
        ('Perimeter wall crack repair', 'structural', 'medium', 'open', props[4], None, None, 400),
        ('Burst pipe in kitchen', 'plumbing', 'emergency', 'completed', props[3], tenants[3], vendors[0], 280),
    ]

    for title, cat, priority, status, prop, reporter, vendor, cost in wo_data:
        wo, _ = WorkOrder.objects.get_or_create(title=title, property=prop, defaults=dict(
            reported_by=reporter, vendor=vendor,
            description=title,
            category=cat, priority=priority, status=status,
            estimated_cost=cost,
            actual_cost=cost if status == 'completed' else None,
            completed_date=datetime.date(2025, 5, 15) if status == 'completed' else None,
        ))

    # ── SALES DATA ────────────────────────────────────────────────────────────
    print("Creating sales data...")

    CommissionStructure.objects.get_or_create(name='Standard 5% (Zimbabwe)', defaults=dict(
        total_rate=5, listing_agent_split=50, buyer_agent_split=50, broker_fee=10, is_default=True))
    CommissionStructure.objects.get_or_create(name='Reduced 3% Developer', defaults=dict(
        total_rate=3, listing_agent_split=60, buyer_agent_split=40, broker_fee=5))

    buyer_contacts = [
        ('Mukudzei', 'Zvobgo',   'mukudzei.zvobgo@gmail.com',  '+263 77 112 2334', 'buyer',  120000, 280000, 'Harare Suburbs'),
        ('Rutendo',  'Maposa',   'rutendo.maposa@gmail.com',   '+263 71 223 3445', 'buyer',  60000,  110000, 'Bulawayo, Gweru'),
        ('Kudzai',   'Machakaire','kudzai@diaspora.co.uk',     '+44 7911 223344',  'buyer',  300000, 600000, 'Harare Premium'),
        ('Tapiwa',   'Tshuma',   'tapiwa.tshuma@gmail.com',   '+263 73 334 4556', 'seller', None,   None,   ''),
        ('Tinashe',  'Chiramba', 'tinashe.chiramba@gmail.com', '+263 78 445 5667', 'both',   150000, 250000, 'Harare, Mutare'),
    ]
    contacts = []
    for fn, ln, email, phone, ctype, bmin, bmax, areas in buyer_contacts:
        c, _ = Contact.objects.get_or_create(email=email, defaults=dict(
            agent=agent, contact_type=ctype,
            first_name=fn, last_name=ln, phone=phone,
            status='active', budget_min=bmin, budget_max=bmax,
            preferred_areas=areas, source='Referral'))
        contacts.append(c)

    # Active listing
    listing, _ = Listing.objects.get_or_create(property=props[5], defaults=dict(
        listing_agent=agent,
        listing_type='sale',
        asking_price=250000,
        status='active',
        listing_date=datetime.date(2025, 4, 1),
        expiry_date=datetime.date(2025, 10, 1),
        description=(
            'Superb 4-bedroom home in Mount Pleasant. '
            'Features solar power, borehole, double garage, servant quarters and '
            'manicured garden. 5 minutes from Sam Levy\'s Village.'
        ),
        days_on_market=52,
        views_count=87,
    ))

    # Offer on the listing
    Offer.objects.get_or_create(listing=listing, buyer=contacts[2], defaults=dict(
        agent=agent,
        offer_amount=235000,
        earnest_money=5000,
        financing_contingency=False,
        inspection_contingency=True,
        appraisal_contingency=False,
        closing_date=datetime.date(2025, 8, 15),
        expiry_date=datetime.date(2025, 7, 15),
        status='submitted',
        notes='Diaspora buyer — funds in USD offshore. Ready to close quickly.',
    ))

    # ── VALUATIONS & PRICE TRENDS ─────────────────────────────────────────────
    print("Creating valuations and price trends...")

    val_obj, _ = Valuation.objects.get_or_create(
        property=props[0], valuation_date=datetime.date(2025, 5, 1),
        defaults=dict(
            performed_by=manager, method='cma',
            estimated_value=320000, low_estimate=295000, high_estimate=345000,
            confidence_score=88.5,
            notes='CMA based on 6 comparable sales in Borrowdale in the past 90 days.',
        ))

    Comparable.objects.get_or_create(valuation=val_obj, address='9 Borrowdale Road, Harare', defaults=dict(
        sale_price=310000, sale_date=datetime.date(2025, 3, 10),
        square_feet=215, bedrooms=4, bathrooms=3,
        distance_miles=0.3, adjustments=5000, notes='Similar size, slightly older'))
    Comparable.objects.get_or_create(valuation=val_obj, address='22 Crowhill Road, Borrowdale', defaults=dict(
        sale_price=335000, sale_date=datetime.date(2025, 2, 20),
        square_feet=240, bedrooms=5, bathrooms=4,
        distance_miles=0.7, adjustments=-15000, notes='Larger stand, pool — adjusted down'))

    price_trend_data = [
        ('Borrowdale, Harare',     520000, 480000, 2100, 38, 18, 6.5),
        ('Avondale, Harare',       120000,  95000, 1050, 52, 67, 3.2),
        ('Highlands, Harare',      380000, 340000, 1480, 44, 22, 4.8),
        ('Mount Pleasant, Harare', 280000, 245000, 1100, 40, 35, 5.1),
        ('Suburbs, Bulawayo',       85000,  72000,  590, 60, 48, 2.1),
        ('CBD, Harare',            310000, 280000, 1720, 55, 12, 1.8),
        ('Mutare Central',          65000,  55000,  500, 70, 30, 0.9),
        ('Greendale, Harare',      160000, 140000,  820, 48, 25, 3.7),
    ]

    for area, avg, med, ppsqm, dom, sales, change in price_trend_data:
        PriceTrend.objects.get_or_create(area=area, period_start=datetime.date(2025, 1, 1), defaults=dict(
            period_end=datetime.date(2025, 6, 30),
            avg_price=avg, median_price=med,
            avg_price_per_sqft=ppsqm,
            avg_days_on_market=dom,
            total_sales=sales,
            price_change_pct=change,
        ))

    # ── EXPENSE CATEGORIES ────────────────────────────────────────────────────
    print("Creating expense categories...")

    expense_cats = [
        ('ZESA Electricity',        'utilities',     True),
        ('ZINWA / City Water',       'utilities',     True),
        ('Property Insurance (Old Mutual/ZB)', 'insurance', True),
        ('ZIMRA Property Tax / Rates', 'taxes',      True),
        ('Council Refuse Removal',   'utilities',     True),
        ('Property Management Fee',  'management',    True),
        ('Security Guarding (Securico/G4S)', 'other', True),
        ('Borehole Maintenance',     'repairs',       True),
        ('Solar System Maintenance', 'repairs',       True),
        ('Garden / Landscaping',     'landscaping',   True),
        ('Mortgage / Bond Repayment', 'mortgage',     False),
        ('Legal Fees (Gill Godlonton & Gerrans)', 'legal', True),
        ('Accounting (Ernst & Young Zimbabwe)', 'accounting', True),
        ('Painting & Decoration',    'repairs',       True),
        ('Pool Maintenance',         'repairs',       True),
        ('Pest Control',             'repairs',       True),
        ('HOA / Cluster Levies',     'hoa',           True),
        ('Advertising (Herald / Classifieds ZW)', 'advertising', True),
        ('General Repairs',          'repairs',       True),
        ('Other Operating Expense',  'other',         True),
    ]
    cat_objs = {}
    for name, ctype, deductible in expense_cats:
        c, _ = ExpenseCategory.objects.get_or_create(name=name, defaults=dict(
            category_type=ctype, is_tax_deductible=deductible))
        cat_objs[name] = c

    # ── OPERATING EXPENSES ────────────────────────────────────────────────────
    print("Creating operating expenses...")

    expense_entries = [
        # (property, category_name, description, amount, date, vendor, status, recurrence)
        (props[0], 'ZESA Electricity', 'ZESA prepaid top-up — March 2025', 180, datetime.date(2025, 3, 5), 'ZESA Holdings', 'paid', 'monthly'),
        (props[0], 'ZESA Electricity', 'ZESA prepaid top-up — April 2025', 180, datetime.date(2025, 4, 5), 'ZESA Holdings', 'paid', 'monthly'),
        (props[0], 'ZESA Electricity', 'ZESA prepaid top-up — May 2025', 180, datetime.date(2025, 5, 5), 'ZESA Holdings', 'pending', 'monthly'),
        (props[0], 'Property Insurance (Old Mutual/ZB)', 'Old Mutual Property Insurance — Q1 2025', 320, datetime.date(2025, 1, 10), 'Old Mutual Zimbabwe', 'paid', 'quarterly'),
        (props[0], 'ZIMRA Property Tax / Rates', 'Harare City Council Rates — Jan-Jun 2025', 480, datetime.date(2025, 1, 20), 'Harare City Council', 'paid', 'none'),
        (props[0], 'Garden / Landscaping', 'Monthly garden service', 60, datetime.date(2025, 4, 1), 'Green Cuts Landscaping', 'paid', 'monthly'),
        (props[0], 'Security Guarding (Securico/G4S)', 'Securico armed response — April 2025', 95, datetime.date(2025, 4, 1), 'Securico', 'paid', 'monthly'),
        (props[0], 'Borehole Maintenance', 'Pump service and pressure tank replacement', 420, datetime.date(2025, 3, 12), 'ZimFix Plumbers', 'paid', 'none'),
        (props[1], 'ZESA Electricity', 'ZESA common area electricity — April', 55, datetime.date(2025, 4, 3), 'ZESA Holdings', 'paid', 'monthly'),
        (props[1], 'Council Refuse Removal', 'Harare City Council refuse — Q1', 90, datetime.date(2025, 1, 15), 'Harare City Council', 'paid', 'quarterly'),
        (props[2], 'ZESA Electricity', 'ZESA prepaid — March 2025', 210, datetime.date(2025, 3, 4), 'ZESA Holdings', 'paid', 'monthly'),
        (props[2], 'Property Insurance (Old Mutual/ZB)', 'ZB Insurance annual premium — 2025', 890, datetime.date(2025, 1, 5), 'ZB Insurance', 'paid', 'annually'),
        (props[2], 'Pool Maintenance', 'Monthly pool chemical service', 75, datetime.date(2025, 4, 8), 'AquaClean Zimbabwe', 'paid', 'monthly'),
        (props[2], 'Solar System Maintenance', 'Solar inverter annual service', 280, datetime.date(2025, 2, 18), 'SolarTech Zimbabwe', 'paid', 'annually'),
        (props[3], 'Property Management Fee', 'Management fee 10% of rent — April', 220, datetime.date(2025, 4, 1), 'PropManager Zimbabwe', 'paid', 'monthly'),
        (props[3], 'Security Guarding (Securico/G4S)', 'G4S access control — April', 340, datetime.date(2025, 4, 1), 'G4S Zimbabwe', 'paid', 'monthly'),
        (props[4], 'ZIMRA Property Tax / Rates', 'Bulawayo City Council Rates 2025', 180, datetime.date(2025, 1, 25), 'Bulawayo City Council', 'paid', 'none'),
        (props[5], 'Advertising (Herald / Classifieds ZW)', 'Herald property listing — April/May', 85, datetime.date(2025, 4, 1), 'Zimbabwe Newspapers', 'paid', 'none'),
        (props[5], 'Legal Fees (Gill Godlonton & Gerrans)', 'Conveyancing preparation for sale', 650, datetime.date(2025, 4, 15), 'Gill Godlonton & Gerrans', 'pending', 'none'),
        (props[6], 'ZESA Electricity', 'Industrial 3-phase electricity — April', 380, datetime.date(2025, 4, 5), 'ZESA Holdings', 'paid', 'monthly'),
        (props[6], 'Property Insurance (Old Mutual/ZB)', 'Industrial unit insurance', 520, datetime.date(2025, 1, 8), 'Old Mutual Zimbabwe', 'paid', 'annually'),
    ]

    for prop, cat_name, desc, amount, date, vendor, st, recur in expense_entries:
        OperatingExpense.objects.get_or_create(
            property=prop, description=desc,
            defaults=dict(
                category=cat_objs[cat_name],
                vendor_name=vendor,
                amount=amount,
                expense_date=date,
                status=st,
                is_recurring=(recur != 'none'),
                recurrence=recur,
                paid_date=date if st == 'paid' else None,
                payment_method='Bank Transfer' if st == 'paid' else '',
                created_by=accountant,
            ))

    # ── CHART OF ACCOUNTS ─────────────────────────────────────────────────────
    print("Creating chart of accounts...")

    accounts_data = [
        # (name, number, type, subtype, is_trust, balance)
        ('FBC Bank — USD Operating Account',   '1001', 'asset',     'checking',           False, 42500),
        ('CBZ Bank — USD Savings',             '1002', 'asset',     'savings',            False, 28000),
        ('Client Trust Account — FBC',         '1010', 'asset',     'trust',              True,  95000),
        ('Security Deposits Trust — Stanbic',  '1011', 'asset',     'trust',              True,  18600),
        ('Rental Income Receivable',           '1100', 'asset',     'accounts_receivable',False,  9250),
        ('Prepaid Expenses',                   '1200', 'asset',     'other',              False,  3100),
        ('Property — Borrowdale Brooke',       '1501', 'asset',     'other',              False, 320000),
        ('Property — Highlands Home',          '1503', 'asset',     'other',              False, 480000),
        ('Accounts Payable',                   '2001', 'liability', 'accounts_payable',   False,  4800),
        ('Security Deposits Held',             '2010', 'liability', 'other',              False, 18600),
        ('VAT Payable (ZIMRA)',                '2100', 'liability', 'other',              False,  2340),
        ('Mortgage — Borrowdale Property',     '2500', 'liability', 'other',              False, 145000),
        ('Owner Equity',                       '3001', 'equity',    'other',              False, 0),
        ('Rental Revenue — Residential',       '4001', 'revenue',   'other',              False, 38400),
        ('Rental Revenue — Commercial',        '4002', 'revenue',   'other',              False, 19800),
        ('Management Fee Income',              '4010', 'revenue',   'other',              False,  3800),
        ('Commission Income',                  '4020', 'revenue',   'other',              False,  0),
        ('ZESA Electricity Expense',           '6001', 'expense',   'other',              False,  1820),
        ('Water & Rates Expense',              '6002', 'expense',   'other',              False,   750),
        ('Insurance Expense',                  '6003', 'expense',   'other',              False,  1730),
        ('Repairs & Maintenance',              '6004', 'expense',   'other',              False,  2150),
        ('Security Expense',                   '6005', 'expense',   'other',              False,  1740),
        ('Management Fees Paid',               '6006', 'expense',   'other',              False,   880),
        ('Legal & Professional Fees',          '6007', 'expense',   'other',              False,  1300),
        ('Garden & Landscaping',               '6008', 'expense',   'other',              False,   360),
        ('Advertising Expense',                '6009', 'expense',   'other',              False,   255),
        ('Depreciation Expense',               '6010', 'expense',   'other',              False,  0),
    ]

    for name, num, atype, subtype, trust, bal in accounts_data:
        Account.objects.get_or_create(account_number=num, defaults=dict(
            name=name, account_type=atype, subtype=subtype,
            is_trust_account=trust, balance=bal))

    print()
    print("=" * 60)
    print("Zimbabwe Real Estate Seed Data — COMPLETE")
    print("=" * 60)
    print()
    print("Login credentials:")
    print("  Admin:       admin       / admin123")
    print("  Manager:     manager     / manager123")
    print("  Agent:       agent       / agent123")
    print("  Accountant:  accountant  / accountant123")
    print("  Tenants:     tenant1-5   / tenant123")
    print()
    print("Properties created:")
    for p in Property.objects.all():
        print(f"  [{p.status:15}] {p.name} — {p.city} (${p.monthly_rent}/mo)")


if __name__ == '__main__':
    run()
