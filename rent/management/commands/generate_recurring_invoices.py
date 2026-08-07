import datetime

from django.core.management.base import BaseCommand

from rent.models import RecurringInvoiceProfile
from rent.views import generate_invoice_from_profile


class Command(BaseCommand):
    """Recurring Invoicing scheduler.

    Generates the next Invoice for every active RecurringInvoiceProfile whose
    next_generation_date has arrived. Intended to run daily via an external
    scheduler — this project has no Celery/APScheduler installed, so wire it up via:

      Linux/macOS (cron, daily at 05:00):
        0 5 * * * /path/to/venv/bin/python /path/to/manage.py generate_recurring_invoices

      Windows (Task Scheduler, daily):
        schtasks /create /tn "PropManagerRecurringInvoices" /tr
            "\"C:\...\venv\Scripts\python.exe\" \"C:\...\manage.py\" generate_recurring_invoices"
            /sc daily /st 05:00
    """
    help = 'Generate invoices for all active RecurringInvoiceProfile rows due today or earlier.'

    def handle(self, *args, **options):
        today = datetime.date.today()
        due_profiles = RecurringInvoiceProfile.objects.filter(
            is_active=True, next_generation_date__lte=today
        ).select_related('lease')
        if not due_profiles.exists():
            self.stdout.write('No recurring invoice profiles are due.')
            return

        for profile in due_profiles:
            if profile.lease.status != 'active':
                self.stdout.write(
                    f'Skipping profile #{profile.pk}: lease #{profile.lease_id} is not active.')
                continue
            invoice = generate_invoice_from_profile(profile)
            self.stdout.write(
                f'Generated {invoice.invoice_number} for {profile.lease.tenant} '
                f'({invoice.period_start} to {invoice.period_end}), next run {profile.next_generation_date}.'
            )
