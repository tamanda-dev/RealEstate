from django.contrib import admin
from .models import Account, JournalEntry, JournalLine, TrustTransaction, Reconciliation, AuditLog


class JournalLineInline(admin.TabularInline):
    model = JournalLine
    extra = 2


@admin.register(JournalEntry)
class JournalEntryAdmin(admin.ModelAdmin):
    list_display = ['entry_number', 'date', 'description', 'status', 'created_by']
    list_filter = ['status']
    inlines = [JournalLineInline]


admin.site.register(Account)
admin.site.register(TrustTransaction)
admin.site.register(Reconciliation)
admin.site.register(AuditLog)
