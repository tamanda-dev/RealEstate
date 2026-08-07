import { useState, useEffect, useCallback } from 'react'
import { Plus, Shield, AlertTriangle, Clock, Filter } from 'lucide-react'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import { preventiveAPI, currencyAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PreventiveMaintenancePage() {
  const { toast } = useToast()
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [rate, setRate] = useState(13.7)

  const [propertyFilter, setPropertyFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({
    property: '', task_name: '', category: 'mechanical',
    frequency: 'monthly', last_completed: '', vendor: '',
    estimated_cost_usd: '', description: '', auto_create_work_order: false,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    currencyAPI.latest().then(({ data }) => {
      if (data?.rate) setRate(parseFloat(data.rate))
    }).catch(() => {})
  }, [])

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (propertyFilter) params.property = propertyFilter
      if (categoryFilter) params.category = categoryFilter
      const { data } = await preventiveAPI.list(params)
      setSchedules(data?.results ?? data ?? [])
    } catch {
      toast('Failed to load schedules', 'error')
    } finally {
      setLoading(false)
    }
  }, [propertyFilter, categoryFilter, toast])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  const handleCreate = async () => {
    if (!form.task_name || !form.property) {
      toast('Task name and property are required', 'error')
      return
    }
    setSaving(true)
    try {
      await preventiveAPI.create(form)
      toast('Schedule created', 'success')
      setShowNew(false)
      setForm({
        property: '', task_name: '', category: 'mechanical',
        frequency: 'monthly', last_completed: '', vendor: '',
        estimated_cost_usd: '', description: '', auto_create_work_order: false,
      })
      loadSchedules()
    } catch {
      toast('Failed to create schedule', 'error')
    } finally {
      setSaving(false)
    }
  }

  const overdue = schedules.filter(s => {
    const d = daysUntil(s.next_due)
    return d !== null && d < 0
  })
  const due30 = schedules.filter(s => {
    const d = daysUntil(s.next_due)
    return d !== null && d >= 0 && d <= 30
  })

  const columns = [
    { key: 'task_name', label: 'Task Name', render: (v, row) => (
      <div>
        <p className="font-medium text-slate-800 text-sm">{v || '—'}</p>
        {row.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-48">{row.description}</p>}
      </div>
    )},
    { key: 'property_name', label: 'Property', render: (v, row) => (
      <span className="text-sm text-slate-600">{v ?? row.property_display ?? '—'}</span>
    )},
    { key: 'category', label: 'Category', render: (v) => <Badge value={v} /> },
    { key: 'frequency', label: 'Frequency', render: (v) => (
      <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full capitalize">{v}</span>
    )},
    { key: 'last_completed', label: 'Last Completed', render: (v) => (
      v ? <span className="text-sm text-slate-600">{new Date(v).toLocaleDateString()}</span> : <span className="text-slate-400">—</span>
    )},
    { key: 'next_due', label: 'Next Due', render: (v) => {
      if (!v) return <span className="text-slate-400">—</span>
      const days = daysUntil(v)
      const isOverdue = days !== null && days < 0
      const isNear = days !== null && days >= 0 && days <= 30
      return (
        <div>
          <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-slate-700'}`}>
            {new Date(v).toLocaleDateString()}
          </p>
          {isOverdue && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={10} /> {Math.abs(days)}d overdue</p>}
          {isNear && <p className="text-xs text-amber-500 flex items-center gap-1"><Clock size={10} /> {days}d away</p>}
        </div>
      )
    }},
    { key: 'vendor_name', label: 'Vendor', render: (v, row) => (
      <span className="text-sm text-slate-600">{v ?? row.vendor_display ?? '—'}</span>
    )},
    { key: 'estimated_cost_usd', label: 'Est. Cost', render: (v) => (
      <div>
        <p className="text-sm font-medium text-slate-700">${fmt(v)}</p>
        {v && <p className="text-xs text-slate-400">ZiG {(parseFloat(v) * rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>}
      </div>
    )},
    { key: 'status', label: 'Status', render: (v, row) => {
      const days = daysUntil(row.next_due)
      const statusVal = v || (days !== null && days < 0 ? 'overdue' : days !== null && days <= 30 ? 'due_soon' : 'active')
      return <Badge value={statusVal} />
    }},
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Preventive Maintenance</h1>
          <p className="text-slate-500 text-sm mt-0.5">Scheduled maintenance tasks and service intervals</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus size={16} /> New Schedule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Shield} label="Total Schedules" value={schedules.length} color="blue" />
        <StatCard icon={AlertTriangle} label="Overdue" value={overdue.length} color="red" />
        <StatCard icon={Clock} label="Due in 30 Days" value={due30.length} color="yellow" />
      </div>

      {/* Overdue Alert */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Overdue Maintenance Tasks</p>
            <p className="text-sm text-red-600 mt-0.5">
              {overdue.length} task{overdue.length !== 1 ? 's' : ''} overdue:{' '}
              {overdue.slice(0, 3).map(s => s.task_name).join(', ')}
              {overdue.length > 3 && ` and ${overdue.length - 3} more`}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          value={propertyFilter}
          onChange={e => setPropertyFilter(e.target.value)}
          placeholder="Filter by property..."
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-48"
        />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All Categories</option>
          <option value="electrical">Electrical</option>
          <option value="plumbing">Plumbing</option>
          <option value="mechanical">Mechanical</option>
          <option value="hvac">HVAC</option>
          <option value="structural">Structural</option>
          <option value="landscaping">Landscaping</option>
          <option value="cleaning">Cleaning</option>
          <option value="security">Security</option>
          <option value="other">Other</option>
        </select>
        <button onClick={loadSchedules}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white hover:bg-slate-50">
          <Filter size={14} /> Apply
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table columns={columns} data={schedules} loading={loading} emptyMessage="No maintenance schedules found" />
      </div>

      {/* New Schedule Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Maintenance Schedule" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Property *</label>
              <input value={form.property} onChange={e => setForm(p => ({ ...p, property: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Property ID or name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Task Name *</label>
              <input value={form.task_name} onChange={e => setForm(p => ({ ...p, task_name: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Generator Service" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="electrical">Electrical</option>
                <option value="plumbing">Plumbing</option>
                <option value="mechanical">Mechanical</option>
                <option value="hvac">HVAC</option>
                <option value="structural">Structural</option>
                <option value="landscaping">Landscaping</option>
                <option value="cleaning">Cleaning</option>
                <option value="security">Security</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="bi_annual">Bi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Last Completed</label>
              <input type="date" value={form.last_completed} onChange={e => setForm(p => ({ ...p, last_completed: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Vendor</label>
              <input value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Vendor ID or name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estimated Cost (USD)</label>
              <input type="number" value={form.estimated_cost_usd} onChange={e => setForm(p => ({ ...p, estimated_cost_usd: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="0.00" />
              {form.estimated_cost_usd && (
                <p className="text-xs text-slate-400 mt-0.5">
                  ZiG {(parseFloat(form.estimated_cost_usd) * rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              )}
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.auto_create_work_order} onChange={e => setForm(p => ({ ...p, auto_create_work_order: e.target.checked }))}
                  className="rounded border-slate-300" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Auto-create Work Orders</p>
                  <p className="text-xs text-slate-400">When task becomes due</p>
                </div>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Describe the maintenance task, scope of work, vendor requirements..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowNew(false)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <Shield size={14} /> {saving ? 'Creating...' : 'Create Schedule'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
