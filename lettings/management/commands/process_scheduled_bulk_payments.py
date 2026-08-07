import datetime

from django.core.management.base import BaseCommand

from lettings.models import BulkPaymentBatch
from lettings.views import execute_bulk_payment_batch


class Command(BaseCommand):
    """Bulk Payments Engine scheduler.

    Executes every BulkPaymentBatch whose status is 'scheduled' and whose
    scheduled_date has arrived. Intended to be run once a day by an external
    scheduler — this project has no Celery/APScheduler installed, so wire it up via:

      Linux/macOS (cron, daily at 06:00):
        0 6 * * * /path/to/venv/bin/python /path/to/manage.py process_scheduled_bulk_payments

      Windows (Task Scheduler, daily):
        schtasks /create /tn "PropManagerBulkPayments" /tr
            "\"C:\...\venv\Scripts\python.exe\" \"C:\...\manage.py\" process_scheduled_bulk_payments"
            /sc daily /st 06:00
    """
    help = 'Execute all BulkPaymentBatch rows scheduled for today or earlier that have not run yet.'

    def handle(self, *args, **options):
        today = datetime.date.today()
        due_batches = BulkPaymentBatch.objects.filter(status='scheduled', scheduled_date__lte=today)
        if not due_batches.exists():
            self.stdout.write('No scheduled bulk payment batches are due.')
            return

        for batch in due_batches:
            result = execute_bulk_payment_batch(batch)
            if 'error' in result:
                self.stderr.write(f'Batch "{batch.name}" (#{batch.pk}): {result["error"]}')
            else:
                self.stdout.write(
                    f'Batch "{batch.name}" (#{batch.pk}): {result["batch_status"]} — '
                    f'{result["paid_count"]} paid, {result["failed_count"]} failed.'
                )
