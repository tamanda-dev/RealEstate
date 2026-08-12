import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('refresh_token')
        if (!refresh) throw new Error('No refresh token')
        const { data } = await axios.post('/api/auth/token/refresh/', { refresh })
        localStorage.setItem('access_token', data.access)
        if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
        original.headers.Authorization = `Bearer ${data.access}`
        return api(original)
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (credentials) => api.post('/auth/token/', credentials),
  refresh: (refresh) => api.post('/auth/token/refresh/', { refresh }),
  me: () => api.get('/users/me/'),
  register: (data) => api.post('/users/', data),
  requestPasswordReset: (email) => api.post('/users/password-reset/', { email }),
  confirmPasswordReset: (uid, token, new_password) =>
    api.post('/users/password-reset/confirm/', { uid, token, new_password }),
  requestPasswordResetSMS: (phone) => api.post('/users/password-reset/', { phone }),
  confirmPasswordResetOTP: (phone, code, new_password) =>
    api.post('/users/password-reset/confirm-otp/', { phone, code, new_password }),
}

// ── Properties ────────────────────────────────────────────────────────────────
// Optional numeric fields on the Property model — empty strings from a blank
// form input fail DRF's DecimalField/IntegerField validation ("A valid number/
// integer is required."), even though the field itself is optional. Strip them
// out entirely so an untouched field is simply omitted rather than sent as ''.
const OPTIONAL_NUMERIC_PROPERTY_FIELDS = [
  'bedrooms', 'bathrooms', 'square_feet', 'lot_size', 'year_built',
  'purchase_price', 'current_value', 'monthly_rent',
]
const sanitizePropertyPayload = (data) => {
  const payload = { ...data }
  OPTIONAL_NUMERIC_PROPERTY_FIELDS.forEach((field) => {
    if (payload[field] === '') delete payload[field]
  })
  return payload
}

export const propertiesAPI = {
  list: (params) => api.get('/properties/', { params }),
  get: (id) => api.get(`/properties/${id}/`),
  create: (data) => api.post('/properties/', sanitizePropertyPayload(data)),
  update: (id, data) => api.patch(`/properties/${id}/`, sanitizePropertyPayload(data)),
  delete: (id) => api.delete(`/properties/${id}/`),
  stats: () => api.get('/properties/dashboard_stats/'),
  units: (id) => api.get(`/properties/${id}/units/`),
  allUnits: (params) => api.get('/properties/units/', { params }),
  portfolioAnalytics: () => api.get('/properties/portfolio_analytics/'),
  roiAnalytics: (id) => api.get(`/properties/${id}/roi_analytics/`),
  unassigned: () => api.get('/properties/unassigned/'),
  assignOwner: (id, ownerId) => api.post(`/properties/${id}/assign_owner/`, { owner_id: ownerId }),
}

// ── Rent ──────────────────────────────────────────────────────────────────────
export const rentAPI = {
  invoices: {
    list: (params) => api.get('/rent/invoices/', { params }),
    get: (id) => api.get(`/rent/invoices/${id}/`),
    create: (data) => api.post('/rent/invoices/', data),
    update: (id, data) => api.patch(`/rent/invoices/${id}/`, data),
    recordPayment: (id, data) => api.post(`/rent/invoices/${id}/record_payment/`, data),
    applyLateFees: () => api.post('/rent/invoices/apply_late_fees/'),
    stats: () => api.get('/rent/invoices/dashboard_stats/'),
  },
  payments: {
    list: (params) => api.get('/rent/payments/', { params }),
    reverse: (id, data) => api.post(`/rent/payments/${id}/reverse/`, data),
  },
  refunds: {
    list: (params) => api.get('/rent/refunds/', { params }),
    create: (data) => api.post('/rent/refunds/', data),
    approve: (id) => api.post(`/rent/refunds/${id}/approve/`),
    reject: (id, data) => api.post(`/rent/refunds/${id}/reject/`, data),
    process: (id, data) => api.post(`/rent/refunds/${id}/process/`, data),
  },
  lateFeeRules: {
    list: () => api.get('/rent/late-fee-rules/'),
    create: (data) => api.post('/rent/late-fee-rules/', data),
    update: (id, data) => api.patch(`/rent/late-fee-rules/${id}/`, data),
    delete: (id) => api.delete(`/rent/late-fee-rules/${id}/`),
  },
  recurringProfiles: {
    list: (params) => api.get('/rent/recurring-profiles/', { params }),
    create: (data) => api.post('/rent/recurring-profiles/', data),
    update: (id, data) => api.patch(`/rent/recurring-profiles/${id}/`, data),
    delete: (id) => api.delete(`/rent/recurring-profiles/${id}/`),
    generateNow: (id) => api.post(`/rent/recurring-profiles/${id}/generate_now/`),
  },
}

// ── Leases ────────────────────────────────────────────────────────────────────
export const leasesAPI = {
  list: (params) => api.get('/leases/', { params }),
  get: (id) => api.get(`/leases/${id}/`),
  create: (data) => api.post('/leases/', data),
  update: (id, data) => api.patch(`/leases/${id}/`, data),
  expiringSoon: (days) => api.get('/leases/expiring_soon/', { params: { days } }),
  delete: (id) => api.delete(`/leases/${id}/`),
  initiateRenewal: (id, data) => api.post(`/leases/${id}/initiate_renewal/`, data),
  stats: () => api.get('/leases/dashboard_stats/'),
  conductRentReview: (id, data) => api.post(`/leases/${id}/conduct-rent-review/`, data),
  diary: (days) => api.get('/leases/lease-diary/', { params: { days } }),
  terminateEarly: (id, data) => api.post(`/leases/${id}/terminate-early/`, data),
  guarantors: {
    list: (params) => api.get('/leases/guarantors/', { params }),
    create: (data) => api.post('/leases/guarantors/', data),
    delete: (id) => api.delete(`/leases/guarantors/${id}/`),
  },
  renewals: {
    list: (params) => api.get('/leases/renewals/', { params }),
    accept: (id) => api.post(`/leases/renewals/${id}/accept/`),
    decline: (id) => api.post(`/leases/renewals/${id}/decline/`),
  },
  clauses: {
    list: (params) => api.get('/leases/clauses/', { params }),
    create: (data) => api.post('/leases/clauses/', data),
    update: (id, data) => api.patch(`/leases/clauses/${id}/`, data),
    delete: (id) => api.delete(`/leases/clauses/${id}/`),
  },
  deposits: {
    list: (params) => api.get('/leases/deposits/', { params }),
    get: (id) => api.get(`/leases/deposits/${id}/`),
    receive: (id, data) => api.post(`/leases/deposits/${id}/receive/`, data),
    requestRefund: (id) => api.post(`/leases/deposits/${id}/request-refund/`),
    approveRefund: (id, data) => api.post(`/leases/deposits/${id}/approve-refund/`, data),
  },
  deductions: {
    list: (params) => api.get('/leases/deposit-deductions/', { params }),
    create: (data) => api.post('/leases/deposit-deductions/', data),
    delete: (id) => api.delete(`/leases/deposit-deductions/${id}/`),
  },
}

// ── Maintenance ───────────────────────────────────────────────────────────────
export const maintenanceAPI = {
  workOrders: {
    list: (params) => api.get('/maintenance/work-orders/', { params }),
    get: (id) => api.get(`/maintenance/work-orders/${id}/`),
    create: (data) => api.post('/maintenance/work-orders/', data),
    update: (id, data) => api.patch(`/maintenance/work-orders/${id}/`, data),
    delete: (id) => api.delete(`/maintenance/work-orders/${id}/`),
    dispatch: (id, data) => api.post(`/maintenance/work-orders/${id}/dispatch_vendor/`, data),
    complete: (id, data) => api.post(`/maintenance/work-orders/${id}/complete/`, data),
    stats: () => api.get('/maintenance/work-orders/dashboard_stats/'),
  },
  vendors: {
    list: (params) => api.get('/maintenance/vendors/', { params }),
    create: (data) => api.post('/maintenance/vendors/', data),
    update: (id, data) => api.patch(`/maintenance/vendors/${id}/`, data),
    delete: (id) => api.delete(`/maintenance/vendors/${id}/`),
  },
  expenses: {
    list: (params) => api.get('/maintenance/expenses/', { params }),
    create: (data) => api.post('/maintenance/expenses/', data),
    update: (id, data) => api.patch(`/maintenance/expenses/${id}/`, data),
    delete: (id) => api.delete(`/maintenance/expenses/${id}/`),
  },
  approvedContractors: {
    list: (params) => api.get('/maintenance/approved-contractors/', { params }),
    availableVendors: (params) => api.get('/maintenance/approved-contractors/available_vendors/', { params }),
    approve: (data) => api.post('/maintenance/approved-contractors/', data),
    revoke: (id) => api.delete(`/maintenance/approved-contractors/${id}/`),
  },
}

// ── Sales ─────────────────────────────────────────────────────────────────────
export const salesAPI = {
  listings: {
    list: (params) => api.get('/sales/listings/', { params }),
    get: (id) => api.get(`/sales/listings/${id}/`),
    create: (data) => api.post('/sales/listings/', data),
    update: (id, data) => api.patch(`/sales/listings/${id}/`, data),
    stats: () => api.get('/sales/listings/dashboard_stats/'),
  },
  contacts: {
    list: (params) => api.get('/sales/contacts/', { params }),
    get: (id) => api.get(`/sales/contacts/${id}/`),
    create: (data) => api.post('/sales/contacts/', data),
    update: (id, data) => api.patch(`/sales/contacts/${id}/`, data),
    delete: (id) => api.delete(`/sales/contacts/${id}/`),
    linkUser: (id, userId) => api.post(`/sales/contacts/${id}/link-user/`, { user_id: userId }),
  },
  offers: {
    list: (params) => api.get('/sales/offers/', { params }),
    create: (data) => api.post('/sales/offers/', data),
    accept: (id) => api.post(`/sales/offers/${id}/accept/`),
    counter: (id, data) => api.post(`/sales/offers/${id}/counter/`, data),
  },
  commissions: {
    list: () => api.get('/sales/commissions/'),
    calculate: (data) => api.post('/sales/commissions/calculate/', data),
  },
}

// ── Valuation ─────────────────────────────────────────────────────────────────
export const valuationAPI = {
  list: (params) => api.get('/valuation/valuations/', { params }),
  get: (id) => api.get(`/valuation/valuations/${id}/`),
  create: (data) => api.post('/valuation/valuations/', data),
  runAVM: (propertyId) => api.post('/valuation/valuations/run_avm/', { property_id: propertyId }),
  comparables: {
    list: (params) => api.get('/valuation/comparables/', { params }),
    create: (data) => api.post('/valuation/comparables/', data),
  },
  priceTrends: {
    list: (params) => api.get('/valuation/price-trends/', { params }),
    create: (data) => api.post('/valuation/price-trends/', data),
  },
}

// ── Accounting ────────────────────────────────────────────────────────────────
export const accountingAPI = {
  accounts: {
    list: (params) => api.get('/accounting/accounts/', { params }),
    create: (data) => api.post('/accounting/accounts/', data),
    update: (id, data) => api.patch(`/accounting/accounts/${id}/`, data),
    balances: () => api.get('/accounting/accounts/balances/'),
    trustAccounts: () => api.get('/accounting/accounts/trust_accounts/'),
    cashbook: (id, params) => api.get(`/accounting/accounts/${id}/cashbook/`, { params }),
  },
  statementImports: {
    list: (params) => api.get('/accounting/statement-imports/', { params }),
    upload: (formData) => api.post('/accounting/statement-imports/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    autoMatch: (id, windowDays) => api.post(`/accounting/statement-imports/${id}/auto_match/`, { window_days: windowDays }),
    finalizeReconciliation: (id, statementBalance) => api.post(`/accounting/statement-imports/${id}/finalize-reconciliation/`, { statement_balance: statementBalance }),
  },
  statementLines: {
    list: (params) => api.get('/accounting/statement-lines/', { params }),
    match: (id, journalLineId) => api.post(`/accounting/statement-lines/${id}/match/`, { journal_line_id: journalLineId }),
    unmatch: (id) => api.post(`/accounting/statement-lines/${id}/unmatch/`),
  },
  journalEntries: {
    list: (params) => api.get('/accounting/journal-entries/', { params }),
    get: (id) => api.get(`/accounting/journal-entries/${id}/`),
    create: (data) => api.post('/accounting/journal-entries/', data),
    post: (id) => api.post(`/accounting/journal-entries/${id}/post_entry/`),
    void: (id) => api.post(`/accounting/journal-entries/${id}/void_entry/`),
  },
  trustTransactions: {
    list: (params) => api.get('/accounting/trust-transactions/', { params }),
    create: (data) => api.post('/accounting/trust-transactions/', data),
  },
  reconciliations: {
    list: (params) => api.get('/accounting/reconciliations/', { params }),
    create: (data) => api.post('/accounting/reconciliations/', data),
    reconcile: (id, data) => api.post(`/accounting/reconciliations/${id}/reconcile/`, data),
  },
  auditLogs: {
    list: (params) => api.get('/accounting/audit-logs/', { params }),
  },
  receipts: {
    list: (params) => api.get('/accounting/receipts/', { params }),
    get: (id) => api.get(`/accounting/receipts/${id}/`),
    create: (data) => api.post('/accounting/receipts/', data),
  },
}

// ── Expenses ──────────────────────────────────────────────────────────────────
export const expensesAPI = {
  list: (params) => api.get('/expenses/', { params }),
  get: (id) => api.get(`/expenses/${id}/`),
  create: (data) => api.post('/expenses/', data),
  update: (id, data) => api.patch(`/expenses/${id}/`, data),
  delete: (id) => api.delete(`/expenses/${id}/`),
  markPaid: (id, data) => api.post(`/expenses/${id}/mark_paid/`, data),
  stats: () => api.get('/expenses/dashboard_stats/'),
  byCategory: (params) => api.get('/expenses/by_category/', { params }),
  monthlyTrend: (params) => api.get('/expenses/monthly_trend/', { params }),
  categories: {
    list: (params) => api.get('/expenses/categories/', { params }),
    create: (data) => api.post('/expenses/categories/', data),
    update: (id, data) => api.patch(`/expenses/categories/${id}/`, data),
    delete: (id) => api.delete(`/expenses/categories/${id}/`),
  },
  budgets: {
    list: (params) => api.get('/expenses/budgets/', { params }),
    create: (data) => api.post('/expenses/budgets/', data),
    update: (id, data) => api.patch(`/expenses/budgets/${id}/`, data),
    vsActual: (params) => api.get('/expenses/budgets/vs_actual/', { params }),
  },
}

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationsAPI = {
  list: (params) => api.get('/notifications/', { params }),
  unreadCount: () => api.get('/notifications/unread_count/'),
  markRead: (id) => api.post(`/notifications/${id}/mark_read/`),
  markAllRead: () => api.post('/notifications/mark_all_read/'),
  generateAlerts: () => api.post('/notifications/generate_alerts/'),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersAPI = {
  list: (params) => api.get('/users/', { params }),
  tenants: () => api.get('/users/tenants/'),
  updateMe: (data) => api.patch('/users/me/', data),
}

// ── CRM ───────────────────────────────────────────────────────────────────────
export const crmAPI = {
  leads: { list: (p) => api.get('/crm/leads/', {params:p}), create: (d) => api.post('/crm/leads/', d), update: (id,d) => api.patch(`/crm/leads/${id}/`, d), stats: () => api.get('/crm/leads/dashboard_stats/'), advanceStage: (id) => api.post(`/crm/leads/${id}/advance_stage/`), logInteraction: (id,d) => api.post(`/crm/leads/${id}/log_interaction/`, d), convertToContact: (id) => api.post(`/crm/leads/${id}/convert-to-contact/`) },
  opportunities: { kanban: (p) => api.get('/crm/opportunities/kanban/', {params:p}), list: (p) => api.get('/crm/opportunities/', {params:p}), update: (id,d) => api.patch(`/crm/opportunities/${id}/`, d) },
  interactions: { list: (p) => api.get('/crm/interactions/', {params:p}), create: (d) => api.post('/crm/interactions/', d) },
  campaigns: { list: () => api.get('/crm/campaigns/'), create: (d) => api.post('/crm/campaigns/', d), execute: (id) => api.post(`/crm/campaigns/${id}/execute/`) },
  stages: { list: (p) => api.get('/crm/stages/', {params:p}) },
}

// ── Currency ──────────────────────────────────────────────────────────────────
export const currencyAPI = { latest: () => api.get('/currency/rates/latest/'), list: () => api.get('/currency/rates/'), create: (d) => api.post('/currency/rates/', d), convert: (d) => api.post('/currency/rates/convert/', d) }

// ── Bookings ──────────────────────────────────────────────────────────────────
export const bookingsAPI = {
  quotations: { list: (p) => api.get('/bookings/quotations/', {params:p}), create: (d) => api.post('/bookings/quotations/', d), send: (id,d) => api.post(`/bookings/quotations/${id}/send/`, d), calculate: (d) => api.post('/bookings/quotations/calculate/', d) },
  reservations: { list: (p) => api.get('/bookings/reservations/', {params:p}), create: (d) => api.post('/bookings/reservations/', d), confirm: (id,d) => api.post(`/bookings/reservations/${id}/confirm/`, d), expiringSoon: () => api.get('/bookings/reservations/expiring_soon/') },
  handovers: { list: (p) => api.get('/bookings/handovers/', {params:p}), create: (d) => api.post('/bookings/handovers/', d), signOff: (id) => api.post(`/bookings/handovers/${id}/sign_off/`) },
}

// ── Documents ─────────────────────────────────────────────────────────────────
export const documentsAPI = { list: (p) => api.get('/documents/', {params:p}), upload: (d) => api.post('/documents/', d, {headers:{'Content-Type':'multipart/form-data'}}), expiringSoon: (days) => api.get('/documents/expiring_soon/', {params:{days}}) }

// ── Company Settings ─────────────────────────────────────────────────────────
export const companyAPI = {
  get: () => api.get('/company-settings/settings/'),
  update: (d) => api.patch('/company-settings/update_settings/', d, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export const whatsappAPI = { send: (d) => api.post('/whatsapp/messages/send/', d), messages: (p) => api.get('/whatsapp/messages/', {params:p}), stats: () => api.get('/whatsapp/messages/stats/'), templates: (p) => api.get('/whatsapp/templates/', {params:p}), createTemplate: (d) => api.post('/whatsapp/templates/', d), getConfig: () => api.get('/whatsapp/config/settings/'), saveConfig: (d) => api.patch('/whatsapp/config/update_settings/', d) }

// ── Messaging (SMS / Email) ─────────────────────────────────────────────────────
export const messagingAPI = {
  email: {
    list: (p) => api.get('/messaging/email/', { params: p }),
    send: (d) => api.post('/messaging/email/send/', d),
    bulkSend: (d) => api.post('/messaging/email/bulk-send/', d),
    stats: () => api.get('/messaging/email/stats/'),
  },
  sms: {
    list: (p) => api.get('/messaging/sms/', { params: p }),
    send: (d) => api.post('/messaging/sms/send/', d),
    stats: () => api.get('/messaging/sms/stats/'),
  },
  emailTemplates: {
    list: (p) => api.get('/messaging/email-templates/', { params: p }),
    create: (d) => api.post('/messaging/email-templates/', d),
    update: (id, d) => api.patch(`/messaging/email-templates/${id}/`, d),
    delete: (id) => api.delete(`/messaging/email-templates/${id}/`),
  },
}

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportsAPI = {
  aging: (p) => api.get('/reports/aging/', {params:p}),
  pl: (p) => api.get('/reports/pl/', {params:p}),
  agentPerformance: () => api.get('/reports/agent-performance/'),
  cashFlow: () => api.get('/reports/cash-flow/'),
  inventory: () => api.get('/reports/inventory/'),
  tenantLedger: (tenantId) => api.get('/reports/tenant-ledger/', {params:{tenant:tenantId}}),
  landlordLedger: (ownerId, year) => api.get('/reports/landlord-ledger/', {params:{owner:ownerId, year}}),
  vatZimra: (p) => api.get('/reports/vat-zimra/', {params:p}),
  commissionTrends: (year) => api.get('/reports/commission-trends/', {params:{year}}),
  rentPerSqm: (p) => api.get('/reports/rent-per-sqm/', {params:p}),
  marketPriceAnalysis: () => api.get('/reports/market-price-analysis/'),
  trialBalance: (p) => api.get('/reports/trial-balance/', {params:p}),
  balanceSheet: (p) => api.get('/reports/balance-sheet/', {params:p}),
  rentStatement: (p) => api.get('/reports/rent-statement/', {params:p}),
  distributeRentStatement: (d) => api.post('/reports/rent-statement/distribute/', d),
  rentRoll: (p) => api.get('/reports/rent-roll/', {params:p}),
}

// ── Preventive Maintenance ────────────────────────────────────────────────────
export const preventiveAPI = {
  list: (p) => api.get('/maintenance/preventive-schedules/', {params:p}),
  create: (d) => api.post('/maintenance/preventive-schedules/', d),
  update: (id,d) => api.patch(`/maintenance/preventive-schedules/${id}/`, d),
  dueSoon: (days) => api.get('/maintenance/preventive-schedules/due_soon/', {params:{days}}),
  markCompleted: (id, d) => api.post(`/maintenance/preventive-schedules/${id}/mark_completed/`, d),
}

// ── Lettings (Inspections + Disbursements) ────────────────────────────────────
export const lettingsAPI = {
  inspections: {
    list: (p) => api.get('/lettings/inspections/', {params:p}),
    create: (d) => api.post('/lettings/inspections/', d),
    update: (id,d) => api.patch(`/lettings/inspections/${id}/`, d),
    upcoming: (days) => api.get('/lettings/inspections/upcoming/', {params:{days}}),
    complete: (id,d) => api.post(`/lettings/inspections/${id}/complete/`, d),
    stats: () => api.get('/lettings/inspections/dashboard_stats/'),
    addChecklistItem: (id,d) => api.post(`/lettings/inspections/${id}/checklist-items/`, d),
    generateReport: (id) => api.get(`/lettings/inspections/${id}/generate-report/`),
    acknowledge: (id) => api.post(`/lettings/inspections/${id}/acknowledge/`),
    compare: (id, withId) => api.get(`/lettings/inspections/${id}/compare/`, { params: withId ? { with: withId } : {} }),
    suggestDeductions: (id) => api.post(`/lettings/inspections/${id}/suggest-deductions/`),
  },
  checklistItems: {
    update: (id,d) => api.patch(`/lettings/inspection-checklist-items/${id}/`, d),
    delete: (id) => api.delete(`/lettings/inspection-checklist-items/${id}/`),
  },
  disbursements: {
    list: (p) => api.get('/lettings/disbursements/', {params:p}),
    create: (d) => api.post('/lettings/disbursements/', d),
    generate: (d) => api.post('/lettings/disbursements/generate/', d),
    markPaid: (id,d) => api.post(`/lettings/disbursements/${id}/mark_paid/`, d),
    annualStatement: (p) => api.get('/lettings/disbursements/landlord_annual_statement/', {params:p}),
  },
  bulkPayments: {
    list: (p) => api.get('/lettings/bulk-payment-batches/', {params:p}),
    create: (d) => api.post('/lettings/bulk-payment-batches/', d),
    execute: (id) => api.post(`/lettings/bulk-payment-batches/${id}/execute/`),
    cancel: (id) => api.post(`/lettings/bulk-payment-batches/${id}/cancel/`),
  },
}

// ── Valuation extended ────────────────────────────────────────────────────────
export const valuationExtAPI = {
  salesComparables: {
    list: (p) => api.get('/valuation/sales-comparables/', {params:p}),
    create: (d) => api.post('/valuation/sales-comparables/', d),
    search: (d) => api.post('/valuation/sales-comparables/search/', d),
    marketSummary: (p) => api.get('/valuation/sales-comparables/market_summary/', {params:p}),
  },
  investmentApproach: (d) => api.post('/valuation/valuations/investment_approach/', d),
  costApproach: (d) => api.post('/valuation/valuations/cost_approach/', d),
  generateReport: (id) => api.post(`/valuation/valuations/${id}/generate_report/`),
}

// ── Portal (Buyer, Seller, Sales Manager) ─────────────────────────────────────
export const portalAPI = {
  savedListings: {
    list: () => api.get('/portal/saved-listings/'),
    myFavourites: () => api.get('/portal/saved-listings/my_favourites/'),
    save: (listingId, notes) => api.post('/portal/saved-listings/', { listing: listingId, notes }),
    remove: (id) => api.delete(`/portal/saved-listings/${id}/`),
  },
  viewings: {
    list: (p) => api.get('/portal/viewing-requests/', { params: p }),
    create: (d) => api.post('/portal/viewing-requests/', d),
    schedule: (id, d) => api.post(`/portal/viewing-requests/${id}/schedule/`, d),
    complete: (id, d) => api.post(`/portal/viewing-requests/${id}/complete/`, d),
    stats: () => api.get('/portal/viewing-requests/dashboard_stats/'),
  },
  buyerOffers: {
    list: (p) => api.get('/portal/buyer-offers/', { params: p }),
    create: (d) => api.post('/portal/buyer-offers/', d),
    review: (id) => api.post(`/portal/buyer-offers/${id}/review/`),
    accept: (id) => api.post(`/portal/buyer-offers/${id}/accept/`),
    reject: (id, reason) => api.post(`/portal/buyer-offers/${id}/reject/`, { reason }),
  },
  agentKPIs: {
    list: (p) => api.get('/portal/agent-kpis/', { params: p }),
    teamSummary: () => api.get('/portal/agent-kpis/team_summary/'),
    create: (d) => api.post('/portal/agent-kpis/', d),
  },
  discounts: {
    list: (p) => api.get('/portal/discount-approvals/', { params: p }),
    request: (d) => api.post('/portal/discount-approvals/', d),
    approve: (id, notes) => api.post(`/portal/discount-approvals/${id}/approve/`, { notes }),
    reject: (id, notes) => api.post(`/portal/discount-approvals/${id}/reject_discount/`, { notes }),
    pendingCount: () => api.get('/portal/discount-approvals/pending_count/'),
  },
}

// ── AML / KYC ─────────────────────────────────────────────────────────────────
export const amlAPI = {
  kyc: {
    list: (p) => api.get('/aml/kyc-profiles/', { params: p }),
    get: (id) => api.get(`/aml/kyc-profiles/${id}/`),
    create: (d) => api.post('/aml/kyc-profiles/', d),
    update: (id, d) => api.patch(`/aml/kyc-profiles/${id}/`, d),
    verify: (id, validYears) => api.post(`/aml/kyc-profiles/${id}/verify/`, { valid_years: validYears }),
    reject: (id) => api.post(`/aml/kyc-profiles/${id}/reject/`),
    recalculateRisk: (id) => api.post(`/aml/kyc-profiles/${id}/recalculate-risk/`),
    screenWatchlist: (id) => api.post(`/aml/kyc-profiles/${id}/screen-watchlist/`),
    stats: () => api.get('/aml/kyc-profiles/dashboard_stats/'),
  },
  monitoredTransactions: {
    list: (p) => api.get('/aml/monitored-transactions/', { params: p }),
    clear: (id, notes) => api.post(`/aml/monitored-transactions/${id}/clear/`, { notes }),
    reportToFiu: (id, notes) => api.post(`/aml/monitored-transactions/${id}/report-to-fiu/`, { notes }),
    goamlExport: (id) => api.get(`/aml/monitored-transactions/${id}/goaml-export/`, { responseType: 'blob' }),
    stats: () => api.get('/aml/monitored-transactions/dashboard_stats/'),
  },
  beneficialOwners: {
    list: (p) => api.get('/aml/beneficial-owners/', { params: p }),
    create: (d) => api.post('/aml/beneficial-owners/', d),
    update: (id, d) => api.patch(`/aml/beneficial-owners/${id}/`, d),
    delete: (id) => api.delete(`/aml/beneficial-owners/${id}/`),
  },
  watchlist: {
    list: (p) => api.get('/aml/watchlist-entries/', { params: p }),
    create: (d) => api.post('/aml/watchlist-entries/', d),
    update: (id, d) => api.patch(`/aml/watchlist-entries/${id}/`, d),
    delete: (id) => api.delete(`/aml/watchlist-entries/${id}/`),
    importCsv: (file) => {
      const form = new FormData()
      form.append('file', file)
      return api.post('/aml/watchlist-entries/import-csv/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
  },
}
