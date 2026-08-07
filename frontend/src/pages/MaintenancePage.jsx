import { useState, useEffect } from 'react'
import { Plus, AlertTriangle, Wrench, Pencil, Trash2 } from 'lucide-react'
import { maintenanceAPI, propertiesAPI } from '../services/api'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'

const TABS = ['Work Orders', 'Vendors', 'Expenses']

const PRIORITY_COLORS = {
  emergency: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
}

const VENDOR_CATEGORIES = [
  'plumbing','electrical','hvac','painting','landscaping',
  'cleaning','roofing','general','pest_control','locksmith',
]

const WO_CATEGORIES = [
  'plumbing','electrical','hvac','appliance','structural',
  'pest','cleaning','landscaping','other',
]

const WO_STATUSES = ['open','assigned','in_progress','completed','cancelled']

const fmtDate     = (d) => d ? new Date(d).toLocaleDateString('en-ZW') : '—'
const fmtCurrency = (v) => v != null ? `$${Number(v).toLocaleString()}` : '—'
const capFirst    = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''

const emptyWO      = { title: '', description: '', property: '', priority: 'medium', category: 'general', status: 'open' }
const emptyVendor  = { name: '', category: 'general', email: '', phone: '' }
const emptyExpense = { work_order: '', description: '', amount: '', expense_date: '', vendor: '' }

export default function MaintenancePage() {
  const [tab, setTab]             = useState('Work Orders')
  const [workOrders, setWorkOrders] = useState([])
  const [vendors, setVendors]       = useState([])
  const [expenses, setExpenses]     = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  // ── Work Order modals ─────────────────────────────────────────────────────
  const [woModal, setWoModal]         = useState(false)
  const [editWO, setEditWO]           = useState(null)
  const [woForm, setWoForm]           = useState(emptyWO)

  const [dispatchModal, setDispatchModal]   = useState(false)
  const [completeModal, setCompleteModal]   = useState(false)
  const [selectedWO, setSelectedWO]         = useState(null)
  const [dispatchForm, setDispatchForm]     = useState({ vendor: '', scheduled_date: '' })
  const [completeForm, setCompleteForm]     = useState({ completion_notes: '', actual_cost: '' })

  // ── Vendor modals ─────────────────────────────────────────────────────────
  const [vendorModal, setVendorModal] = useState(false)
  const [editVendor, setEditVendor]   = useState(null)
  const [vendorForm, setVendorForm]   = useState(emptyVendor)

  // ── Expense modals ────────────────────────────────────────────────────────
  const [expenseModal, setExpenseModal] = useState(false)
  const [editExpense, setEditExpense]   = useState(null)
  const [expenseForm, setExpenseForm]   = useState(emptyExpense)

  // ── Data loaders ──────────────────────────────────────────────────────────
  const fetchWOs = async () => {
    setLoading(true); setError('')
    try {
      const { data } = await maintenanceAPI.workOrders.list()
      setWorkOrders(Array.isArray(data) ? data : data.results ?? [])
    } catch { setError('Failed to load work orders.') }
    finally { setLoading(false) }
  }

  const fetchVendors = async () => {
    try {
      const { data } = await maintenanceAPI.vendors.list()
      setVendors(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchExpenses = async () => {
    try {
      const { data } = await maintenanceAPI.expenses.list()
      setExpenses(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  useEffect(() => {
    propertiesAPI.list({ page_size: 200 })
      .then(r => setProperties(r.data?.results ?? r.data ?? []))
      .catch(() => {})
    fetchWOs(); fetchVendors()
  }, [])

  useEffect(() => { if (tab === 'Expenses') fetchExpenses() }, [tab])

  // ── Work Order CRUD ───────────────────────────────────────────────────────
  const openCreateWO = () => { setEditWO(null); setWoForm(emptyWO); setWoModal(true) }
  const openEditWO   = (wo) => {
    setEditWO(wo)
    setWoForm({
      title: wo.title ?? '', description: wo.description ?? '',
      property: wo.property ?? '', priority: wo.priority ?? 'medium',
      category: wo.category ?? 'general', status: wo.status ?? 'open',
    })
    setWoModal(true)
  }

  const handleWOSubmit = async (e) => {
    e.preventDefault()
    if (!woForm.property) { alert('Please select a property for this work order.'); return }
    setSaving(true)
    try {
      const payload = { ...woForm }
      if (editWO) {
        await maintenanceAPI.workOrders.update(editWO.id, payload)
      } else {
        await maintenanceAPI.workOrders.create(payload)
      }
      setWoModal(false); fetchWOs()
    } catch (err) {
      alert(err?.response?.data?.detail ?? Object.values(err?.response?.data ?? {}).flat().join(' ') ?? 'Failed to save work order.')
    } finally { setSaving(false) }
  }

  const handleDeleteWO = async (wo) => {
    if (!window.confirm(`Delete work order "${wo.title}"? This cannot be undone.`)) return
    try {
      await maintenanceAPI.workOrders.delete(wo.id)
      fetchWOs()
    } catch { alert('Failed to delete work order. It may have linked records.') }
  }

  const handleDispatch = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await maintenanceAPI.workOrders.dispatch(selectedWO.id, dispatchForm)
      setDispatchModal(false); fetchWOs()
    } catch (err) { alert(err?.response?.data?.detail ?? 'Failed to dispatch.') }
    finally { setSaving(false) }
  }

  const handleComplete = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await maintenanceAPI.workOrders.complete(selectedWO.id, completeForm)
      setCompleteModal(false); fetchWOs()
    } catch (err) { alert(err?.response?.data?.detail ?? 'Failed to complete.') }
    finally { setSaving(false) }
  }

  // ── Vendor CRUD ───────────────────────────────────────────────────────────
  const openCreateVendor = () => { setEditVendor(null); setVendorForm(emptyVendor); setVendorModal(true) }
  const openEditVendor   = (v) => {
    setEditVendor(v)
    setVendorForm({ name: v.name ?? '', category: v.category ?? 'general', email: v.email ?? '', phone: v.phone ?? '' })
    setVendorModal(true)
  }

  const handleVendorSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (editVendor) {
        await maintenanceAPI.vendors.update(editVendor.id, vendorForm)
      } else {
        await maintenanceAPI.vendors.create(vendorForm)
      }
      setVendorModal(false); fetchVendors()
    } catch (err) { alert(err?.response?.data?.detail ?? 'Failed to save vendor.') }
    finally { setSaving(false) }
  }

  const handleDeleteVendor = async (v) => {
    if (!window.confirm(`Delete vendor "${v.name}"?`)) return
    try {
      await maintenanceAPI.vendors.delete(v.id)
      fetchVendors()
    } catch { alert('Failed to delete vendor.') }
  }

  // ── Expense CRUD ──────────────────────────────────────────────────────────
  const openCreateExpense = () => { setEditExpense(null); setExpenseForm(emptyExpense); setExpenseModal(true) }
  const openEditExpense   = (exp) => {
    setEditExpense(exp)
    setExpenseForm({
      work_order: exp.work_order ?? '', description: exp.description ?? '',
      amount: exp.amount ?? '', expense_date: exp.expense_date ?? '', vendor: exp.vendor ?? '',
    })
    setExpenseModal(true)
  }

  const handleExpenseSubmit = async (e) => {
    e.preventDefault()
    if (!expenseForm.work_order) { alert('Please link this expense to a Work Order.'); return }
    setSaving(true)
    try {
      const payload = { ...expenseForm }
      if (!payload.vendor) delete payload.vendor
      if (editExpense) {
        await maintenanceAPI.expenses.update(editExpense.id, payload)
      } else {
        await maintenanceAPI.expenses.create(payload)
      }
      setExpenseModal(false); fetchExpenses()
    } catch (err) { alert(err?.response?.data?.detail ?? 'Failed to save expense.') }
    finally { setSaving(false) }
  }

  const handleDeleteExpense = async (exp) => {
    if (!window.confirm('Delete this expense record?')) return
    try {
      await maintenanceAPI.expenses.delete(exp.id)
      fetchExpenses()
    } catch { alert('Failed to delete expense.') }
  }

  // ── Table columns ─────────────────────────────────────────────────────────
  const woColumns = [
    { key: 'work_order_number', label: 'WO #',      render: (v, row) => v ?? `#${row.id}` },
    { key: 'title',             label: 'Title' },
    { key: 'property_name',     label: 'Property',  render: (v, row) => v ?? row.property ?? '—' },
    {
      key: 'priority', label: 'Priority',
      render: (v) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${PRIORITY_COLORS[v] ?? PRIORITY_COLORS.low}`}>
          {v}
        </span>
      )
    },
    { key: 'status',        label: 'Status',    render: (v) => <Badge value={v} /> },
    { key: 'vendor_name',   label: 'Vendor',    render: (v, row) => v ?? row.vendor ?? '—' },
    { key: 'scheduled_date',label: 'Scheduled', render: (v) => fmtDate(v) },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => (
        <div className="flex items-center gap-1 flex-wrap">
          {row.status === 'open' && (
            <button onClick={() => { setSelectedWO(row); setDispatchForm({ vendor: '', scheduled_date: '' }); setDispatchModal(true) }}
              className="text-[11px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">
              Dispatch
            </button>
          )}
          {(row.status === 'in_progress' || row.status === 'assigned') && (
            <button onClick={() => { setSelectedWO(row); setCompleteForm({ completion_notes: '', actual_cost: '' }); setCompleteModal(true) }}
              className="text-[11px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700">
              Complete
            </button>
          )}
          <button onClick={() => openEditWO(row)} title="Edit"
            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
            <Pencil size={13} />
          </button>
          <button onClick={() => handleDeleteWO(row)} title="Delete"
            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
            <Trash2 size={13} />
          </button>
        </div>
      )
    },
  ]

  const expenseColumns = [
    { key: 'work_order',   label: 'Work Order',  render: (v) => v ? `WO #${v}` : '—' },
    { key: 'description',  label: 'Description' },
    { key: 'amount',       label: 'Amount',      render: (v) => fmtCurrency(v) },
    { key: 'expense_date', label: 'Date',        render: (v) => fmtDate(v) },
    { key: 'vendor',       label: 'Vendor',      render: (v, row) => row.vendor_name ?? (v ? `Vendor #${v}` : '—') },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEditExpense(row)} title="Edit"
            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
            <Pencil size={13} />
          </button>
          <button onClick={() => handleDeleteExpense(row)} title="Delete"
            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
            <Trash2 size={13} />
          </button>
        </div>
      )
    },
  ]

  // ── Per-tab header button ─────────────────────────────────────────────────
  const tabAction = {
    'Work Orders': { label: 'New Work Order', action: openCreateWO },
    'Vendors':     { label: 'Add Vendor',      action: openCreateVendor },
    'Expenses':    { label: 'Add Expense',     action: openCreateExpense },
  }[tab]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Maintenance</h1>
          <p className="text-slate-500 text-sm mt-0.5">Work orders, vendors &amp; expenses</p>
        </div>
        <button onClick={tabAction.action}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">
          <Plus size={16} /> {tabAction.label}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {tab === 'Work Orders' && (
          <Table columns={woColumns} data={workOrders} loading={loading} emptyMessage="No work orders found." />
        )}

        {tab === 'Vendors' && (
          <div className="p-5">
            {vendors.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Wrench size={36} className="mx-auto mb-3 opacity-20" />
                <p>No vendors registered. Add your first vendor.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {vendors.map((v) => (
                  <div key={v.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Wrench size={16} className="text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{v.name}</p>
                          <p className="text-xs text-slate-500 capitalize">{capFirst(v.category)}</p>
                        </div>
                      </div>
                      {/* Vendor actions */}
                      <div className="flex gap-1">
                        <button onClick={() => openEditVendor(v)} title="Edit"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteVendor(v)} title="Delete"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {v.email && <p className="text-xs text-slate-500 mb-1">{v.email}</p>}
                    {v.phone && <p className="text-xs text-slate-500">{v.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'Expenses' && (
          <Table columns={expenseColumns} data={expenses} loading={false} emptyMessage="No expenses recorded." />
        )}
      </div>

      {/* ── Work Order Modal (Create / Edit) ── */}
      <Modal open={woModal} onClose={() => { setWoModal(false); setEditWO(null) }}
        title={editWO ? `Edit Work Order — ${editWO.title}` : 'Create Work Order'} size="lg">
        <form onSubmit={handleWOSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title *</label>
            <input required value={woForm.title} onChange={e => setWoForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Fix leaking geyser — Unit 3A"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea rows={3} value={woForm.description} onChange={e => setWoForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Property *</label>
              <select required value={woForm.property} onChange={e => setWoForm(f => ({ ...f, property: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select property —</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Priority</label>
              <select value={woForm.priority} onChange={e => setWoForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['emergency','high','medium','low'].map(p => <option key={p} value={p}>{capFirst(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category</label>
              <select value={woForm.category} onChange={e => setWoForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {WO_CATEGORIES.map(c => <option key={c} value={c}>{capFirst(c)}</option>)}
              </select>
            </div>
            {editWO && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                <select value={woForm.status} onChange={e => setWoForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {WO_STATUSES.map(s => <option key={s} value={s}>{capFirst(s)}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setWoModal(false); setEditWO(null) }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : editWO ? 'Save Changes' : 'Create Work Order'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Dispatch Modal ── */}
      <Modal open={dispatchModal} onClose={() => setDispatchModal(false)} title="Dispatch to Vendor" size="sm">
        <form onSubmit={handleDispatch} className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
            Work Order: <strong className="text-slate-800">{selectedWO?.title}</strong>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Select Vendor *</label>
            <select required value={dispatchForm.vendor}
              onChange={e => setDispatchForm(f => ({ ...f, vendor: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Choose vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Scheduled Date *</label>
            <input required type="date" value={dispatchForm.scheduled_date}
              onChange={e => setDispatchForm(f => ({ ...f, scheduled_date: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setDispatchModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Dispatching…' : 'Dispatch'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Complete Modal ── */}
      <Modal open={completeModal} onClose={() => setCompleteModal(false)} title="Mark as Complete" size="sm">
        <form onSubmit={handleComplete} className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
            Work Order: <strong className="text-slate-800">{selectedWO?.title}</strong>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Completion Notes</label>
            <textarea rows={3} value={completeForm.completion_notes}
              onChange={e => setCompleteForm(f => ({ ...f, completion_notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Actual Cost (USD)</label>
            <input type="number" step="0.01" value={completeForm.actual_cost}
              onChange={e => setCompleteForm(f => ({ ...f, actual_cost: e.target.value }))}
              placeholder="e.g. 150.00"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCompleteModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Mark Complete'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Vendor Modal (Create / Edit) ── */}
      <Modal open={vendorModal} onClose={() => { setVendorModal(false); setEditVendor(null) }}
        title={editVendor ? `Edit Vendor — ${editVendor.name}` : 'Add Vendor'} size="sm">
        <form onSubmit={handleVendorSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Vendor Name *</label>
            <input required value={vendorForm.name}
              onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Zimplumb Services"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category *</label>
            <select required value={vendorForm.category}
              onChange={e => setVendorForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{capFirst(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
            <input type="email" value={vendorForm.email}
              onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))}
              placeholder="vendor@example.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
            <input value={vendorForm.phone}
              onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+263 77 000 0000"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => { setVendorModal(false); setEditVendor(null) }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : editVendor ? 'Save Changes' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Expense Modal (Create / Edit) ── */}
      <Modal open={expenseModal} onClose={() => { setExpenseModal(false); setEditExpense(null) }}
        title={editExpense ? 'Edit Expense' : 'Add Expense'} size="sm">
        <form onSubmit={handleExpenseSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work Order *</label>
            <select required value={expenseForm.work_order}
              onChange={e => setExpenseForm(f => ({ ...f, work_order: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Select a work order —</option>
              {workOrders.map(wo => (
                <option key={wo.id} value={wo.id}>{wo.work_order_number ?? `#${wo.id}`} — {wo.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description *</label>
            <input required value={expenseForm.description}
              onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Plumbing materials"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount (USD) *</label>
              <input required type="number" step="0.01" min="0" value={expenseForm.amount}
                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date *</label>
              <input required type="date" value={expenseForm.expense_date}
                onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Vendor</label>
            <select value={expenseForm.vendor}
              onChange={e => setExpenseForm(f => ({ ...f, vendor: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— No vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => { setExpenseModal(false); setEditExpense(null) }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : editExpense ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
