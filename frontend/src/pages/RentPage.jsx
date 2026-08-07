import { useState, useEffect } from 'react'
import { DollarSign, Plus, AlertTriangle, Check, RefreshCw, Pencil, Trash2 } from 'lucide-react'
import { rentAPI, propertiesAPI, usersAPI, leasesAPI } from '../services/api'
import { useToast } from '../context/ToastContext'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import Table from '../components/Table'

const TABS = ['Invoices', 'Payments', 'Late Fee Rules', 'Recurring Invoices']

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer / RTGS' },
  { value: 'ecocash', label: 'EcoCash' },
  { value: 'zipit', label: 'Zipit' },
  { value: 'swipe', label: 'Swipe (POS)' },
  { value: 'cash', label: 'Cash (USD)' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online Portal' },
]

const emptyInvoice = {
  tenant: '', property: '', unit: '',
  period_start: '', period_end: '', due_date: '',
  rent_amount: '', other_charges: '', notes: '', status: 'sent', paid_amount: '',
}

export default function RentPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState('Invoices')
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [lateFeeRules, setLateFeeRules] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  // Create Invoice
  const [invModal, setInvModal] = useState(false)
  const [invForm, setInvForm] = useState(emptyInvoice)
  const [savingInv, setSavingInv] = useState(false)
  const [invTenants, setInvTenants] = useState([])
  const [invProperties, setInvProperties] = useState([])
  const [invUnits, setInvUnits] = useState([])

  const [payModal, setPayModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'bank_transfer', payment_date: '', notes: '' })
  const [paying, setPaying] = useState(false)

  const [ruleModal, setRuleModal] = useState(false)
  const [ruleForm, setRuleForm] = useState({ name: '', fee_type: 'flat', fee_amount: '', grace_period_days: 5 })
  const [editRule, setEditRule] = useState(null)
  const [savingRule, setSavingRule] = useState(false)

  const [applyingFees, setApplyingFees] = useState(false)

  const fmtCurrency = (v) => v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const fetchData = async () => {
    setLoading(true)
    try {
      const [invRes, statsRes] = await Promise.allSettled([
        rentAPI.invoices.list(),
        rentAPI.invoices.stats(),
      ])
      if (invRes.status === 'fulfilled') {
        const d = invRes.value.data
        setInvoices(Array.isArray(d) ? d : d.results ?? [])
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
    } catch {
      toast('Failed to load rent data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = async () => {
    try {
      const { data } = await rentAPI.payments.list()
      setPayments(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchRules = async () => {
    try {
      const { data } = await rentAPI.lateFeeRules.list()
      setLateFeeRules(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  // ── Recurring Invoice Profiles ──────────────────────────────────────────────
  const [recurringProfiles, setRecurringProfiles] = useState([])
  const [activeLeases, setActiveLeases] = useState([])
  const [profileModal, setProfileModal] = useState(false)
  const [profileForm, setProfileForm] = useState({
    lease: '', frequency: 'monthly', billing_day: 1, due_in_days: 5,
    currency: 'USD', auto_generate_disbursement: false,
    next_generation_date: new Date().toISOString().split('T')[0],
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [generatingId, setGeneratingId] = useState(null)

  const fetchRecurringProfiles = async () => {
    try {
      const { data } = await rentAPI.recurringProfiles.list()
      setRecurringProfiles(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchActiveLeases = async () => {
    try {
      const { data } = await leasesAPI.list({ status: 'active' })
      setActiveLeases(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const handleCreateProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await rentAPI.recurringProfiles.create(profileForm)
      toast('Recurring invoice profile created', 'success')
      setProfileModal(false)
      fetchRecurringProfiles()
    } catch (err) {
      toast(err?.response?.data?.detail ?? 'Failed to create profile', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleGenerateNow = async (id) => {
    setGeneratingId(id)
    try {
      const { data } = await rentAPI.recurringProfiles.generateNow(id)
      toast(`Invoice ${data.invoice_number} generated`, 'success')
      fetchRecurringProfiles()
    } catch (err) {
      toast(err?.response?.data?.error ?? 'Failed to generate invoice', 'error')
    } finally {
      setGeneratingId(null)
    }
  }

  const profileColumns = [
    { key: 'tenant_name', label: 'Tenant' },
    { key: 'property_name', label: 'Property' },
    { key: 'monthly_rent', label: 'Rent', render: (v) => fmtCurrency(v) },
    { key: 'frequency', label: 'Frequency', render: (v) => <Badge value={v} /> },
    { key: 'currency', label: 'Currency' },
    { key: 'next_generation_date', label: 'Next Run' },
    { key: 'auto_generate_disbursement', label: 'Auto-Distribute', render: (v) => v ? <Badge value="enabled" /> : '—' },
    { key: 'is_active', label: 'Active', render: (v) => <Badge value={v ? 'active' : 'inactive'} /> },
    {
      key: 'id', label: 'Action',
      render: (v) => (
        <button onClick={() => handleGenerateNow(v)} disabled={generatingId === v}
          className="text-xs px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {generatingId === v ? 'Generating…' : 'Generate Now'}
        </button>
      ),
    },
  ]

  useEffect(() => { fetchData() }, [])
  useEffect(() => {
    if (tab === 'Payments') fetchPayments()
    if (tab === 'Late Fee Rules') fetchRules()
    if (tab === 'Recurring Invoices') { fetchRecurringProfiles(); fetchActiveLeases() }
  }, [tab])

  // ── Create Invoice helpers ─────────────────────────────────────────────────
  const openInvModal = async () => {
    setInvForm(emptyInvoice)
    setInvModal(true)
    const [propRes, tenRes] = await Promise.allSettled([
      propertiesAPI.list({ page_size: 200 }),
      usersAPI.list({ role: 'tenant', page_size: 200 }),
    ])
    if (propRes.status === 'fulfilled')
      setInvProperties(propRes.value.data?.results ?? propRes.value.data ?? [])
    if (tenRes.status === 'fulfilled')
      setInvTenants(tenRes.value.data?.results ?? tenRes.value.data ?? [])
    else {
      usersAPI.tenants().then(r => setInvTenants(r.data?.results ?? r.data ?? [])).catch(() => {})
    }
  }

  const handleInvPropertyChange = async (propId) => {
    setInvForm(f => ({ ...f, property: propId, unit: '' }))
    setInvUnits([])
    if (!propId) return
    try {
      const r = await propertiesAPI.units(propId)
      setInvUnits(r.data?.results ?? r.data ?? [])
    } catch {}
  }

  const handleCreateInvoice = async (e) => {
    e.preventDefault()
    setSavingInv(true)
    try {
      const payload = { ...invForm }
      if (!payload.unit) delete payload.unit
      if (!payload.property) delete payload.property
      if (!payload.paid_amount) delete payload.paid_amount
      await rentAPI.invoices.create(payload)
      setInvModal(false)
      toast('Invoice created', 'success')
      fetchData()
    } catch (err) {
      const data = err?.response?.data
      toast(
        typeof data === 'string' ? data
          : data?.detail ?? Object.entries(data ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
          ?? 'Failed to create invoice.',
        'error'
      )
    } finally { setSavingInv(false) }
  }

  // ── Late Fee Rule edit/delete ───────────────────────────────────────────────
  const openEditRule = (r) => {
    setEditRule(r)
    setRuleForm({ name: r.name, fee_type: r.fee_type, fee_amount: r.fee_amount, grace_period_days: r.grace_period_days })
    setRuleModal(true)
  }

  const handleDeleteRule = async (r) => {
    if (!window.confirm(`Delete rule "${r.name}"?`)) return
    try {
      await rentAPI.lateFeeRules.delete(r.id)
      toast('Rule deleted', 'success')
      fetchRules()
    } catch { toast('Failed to delete rule', 'error') }
  }

  const handleAddRule = async (e) => {
    e.preventDefault()
    setSavingRule(true)
    try {
      if (editRule) {
        await rentAPI.lateFeeRules.update(editRule.id, ruleForm)
        toast('Rule updated', 'success')
      } else {
        await rentAPI.lateFeeRules.create(ruleForm)
        toast('Late fee rule created', 'success')
      }
      setRuleModal(false)
      setEditRule(null)
      setRuleForm({ name: '', fee_type: 'flat', fee_amount: '', grace_period_days: 5 })
      fetchRules()
    } catch (err) {
      toast(err?.response?.data?.detail || 'Failed to save rule', 'error')
    } finally {
      setSavingRule(false)
    }
  }

  const openPayModal = (invoice) => {
    setSelectedInvoice(invoice)
    const balance = Number(invoice.total_amount) - Number(invoice.paid_amount)
    setPayForm({
      amount: balance.toFixed(2),
      payment_method: 'bank_transfer',
      payment_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setPayModal(true)
  }

  const handlePayment = async (e) => {
    e.preventDefault()
    setPaying(true)
    try {
      await rentAPI.invoices.recordPayment(selectedInvoice.id, payForm)
      setPayModal(false)
      toast('Payment recorded successfully', 'success')
      fetchData()
    } catch (err) {
      toast(err?.response?.data?.error || 'Failed to record payment', 'error')
    } finally {
      setPaying(false)
    }
  }

  const handleApplyLateFees = async () => {
    setApplyingFees(true)
    try {
      const { data } = await rentAPI.invoices.applyLateFees()
      toast(data.message || 'Late fees applied', 'success')
      fetchData()
    } catch {
      toast('Failed to apply late fees', 'error')
    } finally {
      setApplyingFees(false)
    }
  }

  const invoiceColumns = [
    { key: 'invoice_number', label: 'Invoice #', render: (v) => <span className="font-mono text-sm font-medium">{v}</span> },
    { key: 'tenant_name', label: 'Tenant' },
    { key: 'property_name', label: 'Property' },
    { key: 'rent_amount', label: 'Rent', render: (v) => fmtCurrency(v) },
    {
      key: 'paid_amount', label: 'Paid / Total',
      render: (v, row) => (
        <span className={Number(v) < Number(row.total_amount) ? 'text-amber-600' : 'text-green-600'}>
          {fmtCurrency(v)} / {fmtCurrency(row.total_amount)}
        </span>
      )
    },
    { key: 'balance_due', label: 'Balance', render: (v) => <span className={Number(v) > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{fmtCurrency(v)}</span> },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'due_date', label: 'Due', render: (v) => fmtDate(v) },
    {
      key: 'id', label: '',
      render: (v, row) => row.status !== 'paid' && row.status !== 'cancelled' ? (
        <button onClick={() => openPayModal(row)}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">
          Pay
        </button>
      ) : row.status === 'paid'
        ? <span className="text-green-600 text-xs flex items-center gap-1"><Check size={12} /> Paid</span>
        : null
    },
  ]

  const paymentColumns = [
    { key: 'invoice_number', label: 'Invoice #', render: (v, row) => <span className="font-mono text-sm">{v ?? `#${row.invoice}`}</span> },
    { key: 'tenant_name', label: 'Tenant', render: (v) => v || '—' },
    { key: 'amount', label: 'Amount', render: (v) => fmtCurrency(v) },
    { key: 'payment_method', label: 'Method', render: (v) => v?.replace(/_/g, ' ') || '—' },
    { key: 'payment_date', label: 'Date', render: (v) => fmtDate(v) },
    { key: 'reference_number', label: 'Reference', render: (v) => v || '—' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rent Collection</h1>
          <p className="text-slate-500 text-sm mt-0.5">Invoices, payments & late fee rules</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openInvModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={15} /> New Invoice
          </button>
          <button onClick={handleApplyLateFees} disabled={applyingFees}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors">
            <RefreshCw size={15} className={applyingFees ? 'animate-spin' : ''} />
            {applyingFees ? 'Applying...' : 'Apply Late Fees'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={DollarSign} label="Total Invoiced" value={`$${Number(stats.total_invoiced).toLocaleString()}`} color="blue" />
          <StatCard icon={Check} label="Collected" value={`$${Number(stats.total_collected).toLocaleString()}`} color="green" />
          <StatCard icon={AlertTriangle} label="Overdue Amt" value={`$${Number(stats.overdue_amount).toLocaleString()}`} color="red" />
          <StatCard icon={AlertTriangle} label="Overdue #" value={stats.overdue_count} color="red" />
          <StatCard icon={DollarSign} label="Pending" value={stats.pending_count} color="yellow" />
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm font-medium transition-colors ${
                tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t}
            </button>
          ))}
        </div>

        <div>
          {tab === 'Invoices' && (
            <Table columns={invoiceColumns} data={invoices} loading={loading} emptyMessage="No invoices found." />
          )}
          {tab === 'Payments' && (
            <Table columns={paymentColumns} data={payments} loading={false} emptyMessage="No payments recorded." />
          )}
          {tab === 'Late Fee Rules' && (
            <div className="p-5">
              <div className="flex justify-end mb-4">
                <button onClick={() => setRuleModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                  <Plus size={15} /> Add Rule
                </button>
              </div>
              {lateFeeRules.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No late fee rules configured.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {lateFeeRules.map(r => (
                    <div key={r.id} className="flex items-center justify-between py-3 px-1">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{r.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {r.fee_type === 'flat' ? `Flat $${r.fee_amount}` : `${r.fee_amount}%`}
                          {' · '}Grace period: {r.grace_period_days} days
                          {r.max_fee ? ` · Max: $${r.max_fee}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge value={r.is_active ? 'active' : 'inactive'} />
                        <button onClick={() => openEditRule(r)} title="Edit"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteRule(r)} title="Delete"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === 'Recurring Invoices' && (
            <div className="p-5">
              <div className="flex justify-end mb-4">
                <button onClick={() => setProfileModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                  <Plus size={15} /> New Recurring Profile
                </button>
              </div>
              <Table columns={profileColumns} data={recurringProfiles} loading={false}
                emptyMessage="No recurring invoice profiles configured." />
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Record Payment" size="sm">
        <form onSubmit={handlePayment} className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p className="text-slate-500">Invoice: <span className="font-semibold text-slate-800">{selectedInvoice?.invoice_number}</span></p>
            <p className="text-slate-500 mt-1">Balance due: <span className="font-bold text-red-600">
              {fmtCurrency(selectedInvoice ? Number(selectedInvoice.total_amount) - Number(selectedInvoice.paid_amount) : 0)}
            </span></p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
            <input required type="number" step="0.01" value={payForm.amount}
              onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
            <input required type="date" value={payForm.payment_date}
              onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <select value={payForm.payment_method}
              onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea rows={2} value={payForm.notes}
              onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setPayModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={paying}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {paying ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Late Fee Rule Modal */}
      <Modal open={ruleModal} onClose={() => { setRuleModal(false); setEditRule(null) }}
        title={editRule ? 'Edit Late Fee Rule' : 'Add Late Fee Rule'} size="sm">
        <form onSubmit={handleAddRule} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rule Name *</label>
            <input required value={ruleForm.name}
              onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fee Type</label>
            <select value={ruleForm.fee_type}
              onChange={e => setRuleForm({ ...ruleForm, fee_type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="flat">Flat Amount ($)</option>
              <option value="percent">Percentage (%)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {ruleForm.fee_type === 'flat' ? 'Amount ($) *' : 'Rate (%) *'}
            </label>
            <input required type="number" step="0.01" value={ruleForm.fee_amount}
              onChange={e => setRuleForm({ ...ruleForm, fee_amount: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Grace Period (days)</label>
            <input type="number" value={ruleForm.grace_period_days}
              onChange={e => setRuleForm({ ...ruleForm, grace_period_days: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => { setRuleModal(false); setEditRule(null) }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={savingRule}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {savingRule ? 'Saving...' : editRule ? 'Save Changes' : 'Create Rule'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Invoice Modal */}
      <Modal open={invModal} onClose={() => setInvModal(false)} title="New Rent Invoice" size="lg">
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tenant *</label>
              <select required value={invForm.tenant}
                onChange={e => setInvForm(f => ({ ...f, tenant: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select tenant —</option>
                {invTenants.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Property</label>
              <select value={invForm.property}
                onChange={e => handleInvPropertyChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select property —</option>
                {invProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Unit</label>
              <select value={invForm.unit}
                onChange={e => setInvForm(f => ({ ...f, unit: e.target.value }))}
                disabled={!invForm.property}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                <option value="">— All / General —</option>
                {invUnits.map(u => <option key={u.id} value={u.id}>{u.unit_number}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
              <select value={invForm.status}
                onChange={e => setInvForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['draft','sent','paid','partial','overdue'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Period Start *</label>
              <input required type="date" value={invForm.period_start}
                onChange={e => setInvForm(f => ({ ...f, period_start: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Period End *</label>
              <input required type="date" value={invForm.period_end}
                onChange={e => setInvForm(f => ({ ...f, period_end: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Due Date *</label>
              <input required type="date" value={invForm.due_date}
                onChange={e => setInvForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Rent Amount (USD) *</label>
              <input required type="number" step="0.01" min="0" value={invForm.rent_amount}
                onChange={e => setInvForm(f => ({ ...f, rent_amount: e.target.value }))}
                placeholder="e.g. 600.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Other Charges (USD)</label>
              <input type="number" step="0.01" min="0" value={invForm.other_charges}
                onChange={e => setInvForm(f => ({ ...f, other_charges: e.target.value }))}
                placeholder="e.g. 50.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {invForm.status === 'partial' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount Already Paid (USD) *</label>
              <input required type="number" step="0.01" min="0.01" value={invForm.paid_amount}
                onChange={e => setInvForm(f => ({ ...f, paid_amount: e.target.value }))}
                placeholder="e.g. 300.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <textarea rows={2} value={invForm.notes}
              onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setInvModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={savingInv}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {savingInv ? 'Creating…' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Recurring Invoice Profile Modal */}
      <Modal open={profileModal} onClose={() => setProfileModal(false)} title="New Recurring Invoice Profile" size="sm">
        <form onSubmit={handleCreateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Active Lease *</label>
            <select required value={profileForm.lease}
              onChange={e => setProfileForm(f => ({ ...f, lease: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select lease…</option>
              {activeLeases.map(l => (
                <option key={l.id} value={l.id}>
                  {(l.tenant_name ?? l.tenant)} — {(l.property_name ?? l.property)} (${l.monthly_rent}/mo)
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
              <select value={profileForm.frequency}
                onChange={e => setProfileForm(f => ({ ...f, frequency: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Billing Currency</label>
              <select value={profileForm.currency}
                onChange={e => setProfileForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Billing Day</label>
              <input type="number" min={1} max={28} value={profileForm.billing_day}
                onChange={e => setProfileForm(f => ({ ...f, billing_day: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due In (days)</label>
              <input type="number" min={0} value={profileForm.due_in_days}
                onChange={e => setProfileForm(f => ({ ...f, due_in_days: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">First Generation Date</label>
              <input type="date" required value={profileForm.next_generation_date}
                onChange={e => setProfileForm(f => ({ ...f, next_generation_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="autodist" checked={profileForm.auto_generate_disbursement}
              onChange={e => setProfileForm(f => ({ ...f, auto_generate_disbursement: e.target.checked }))}
              className="rounded" />
            <label htmlFor="autodist" className="text-sm text-slate-700">
              Auto-distribute to landlord when each invoice is paid in full
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setProfileModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={savingProfile}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {savingProfile ? 'Creating…' : 'Create Profile'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
