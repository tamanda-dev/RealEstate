# PropManager ZW — Real Estate ERP

A full-stack real estate management platform built for the Zimbabwean market.

## Tech Stack

- **Backend**: Django 6 + Django REST Framework + SimpleJWT
- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Auth**: JWT with token refresh

## Features

- Property management (rental & sales portfolio)
- Lease management with renewal workflows
- Rent collection, invoicing & payment tracking
- Maintenance work orders, vendors & expenses
- CRM / leads pipeline
- Valuation & appraisal workbench
- Accounting, expenses & reporting
- Buyer / seller / tenant portals
- WhatsApp integration
- Multi-currency: USD + ZiG

## Setup

### Backend
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` → `http://localhost:8000`.

## Default port

- Backend: http://localhost:8000
- Frontend: http://localhost:5173
