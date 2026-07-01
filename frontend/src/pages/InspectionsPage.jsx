import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardCheck, AlertTriangle, CheckCircle2, Clock, CalendarDays,
  Plus, CheckSquare, Square, X
} from 'lucide-react'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import { useToast } from '../context/ToastContext'
import { lettingsAPI, propertiesAPI } from '../services/api'

const TYPE_COLORS = {
  routine: 'blue',
  move_in: 'green',
  move_out: 'orange',
  annual: 'purple',
  pre_sale: 'yellow',
}

function TypeBadge({ value }) {
  const color = TYPE_COLORS[value] ?? 'gray'
  const label = value?.replace('_', ' ') ?? value
  const cls = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    purple: 'bg-purple-100 text-purple-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    gray: 'bg-gray-100 text-gray-700',
  }[color]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}>
      {label}
    </span>
  )
}

function dateColor(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = (d - now) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'text-red-600 font-semibold'
  if (diff <= 7) return 'text-amber-600 font-semibold'
  return 'text-slate-700'
}

const EMPTY_COMPLETE = {
  actual_date: '',
  overall_condition: 'good',
  report_summary: '',
  action_required: false,
  action_description: '',
  next_inspection_date: '',
}

const EMPTY_SCHEDULE = {
  property_id: '',
  inspection_type: 'routine',
  scheduled_date: '',
  inspector: '',
  tenant_notified: false,
  notes: '',
}

export default function InspectionsPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('scheduled')
  const [stats, setStats] = useState(null)
  const [scheduled, setScheduled] = useState([])
  const [completed, setCompleted] = useState([])
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState([])

  // Complete modal
  const [completeModal, setCompleteModal] = useState(false)
  const [selectedInspection, setSelectedInspection] = useState(null)
  const [completeForm, setCompleteForm] = useState(EMPTY_COMPLETE)
  const [completing, setCompleting] = useState(false)

  // Schedule modal
  const [scheduleModal, setScheduleModal] = useState(false)
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE)
  const [scheduling, setScheduling] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, scheduledRes, completedRes, propsRes] = await Promise.all([
        lettingsAPI.inspections.stats(),
        lettingsAPI.inspections.list({ status: 'scheduled' }),
        lettingsAPI.inspections.list({ status: 'completed' }),
        propertiesAPI.list(),
      ])
      setStats(statsRes.data)
      setScheduled(Array.isArray(scheduledRes.data) ? scheduledRes.data : scheduledRes.data?.results ?? [])
      setCompleted(Array.isArray(completedRes.data) ? completedRes.data : completedRes.data?.results ?? [])
      setProperties(Array.isArray(propsRes.data) ? propsRes.data : propsRes.data?.results ?? [])
    } catch {
      toast.toast('Failed to load inspections data', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openComplete = (inspection) => {
    setSelectedInspection(inspection)
    setCompleteForm({ ...EMPTY_COMPLETE, actual_date: new Date().toISOString().slice(0, 10) })
    setCompleteModal(true)
  }

  const handleComplete = async (e) => {
    e.preventDefault()
    setCompleting(true)
    try {
      await lettingsAPI.inspections.complete(selectedInspection.id, completeForm)
      toast.toast('Inspection marked complete', 'success')
      setCompleteModal(false)
      fetchAll()
    } catch {
      toast.toast('Failed to complete inspection', 'error')
    } finally {
      setCompleting(false)
    }
  }

  const handleSchedule = async (e) => {
    e.preventDefault()
    setScheduling(true)
    try {
      await lettingsAPI.inspections.create(scheduleForm)
      toast.toast('Inspection scheduled successfully', 'success')
      setScheduleModal(false)
      setScheduleForm(EMPTY_SCHEDULE)
      fetchAll()
    } catch {
      toast.toast('Failed to schedule inspection', 'error')
    } finally {
      setScheduling(false)
    }
  }

  const overdueCount = scheduled.filter(i => {
    if (!i.scheduled_date) return false
    return new Date(i.scheduled_date) < new Date()
  }).length

  const scheduledColumns = [
    { key: 'property', label: 'Property', render: (v, row) => <span className="font-medium text-slate-800">{row.property_name ?? row.property ?? '-'}</span> },
    { key: 'inspection_type', label: 'Type', render: (v) => <TypeBadge value={v} /> },
    {
      key: 'scheduled_date', label: 'Scheduled Date',
      render: (v) => <span className={dateColor(v)}>{v ? new Date(v).toLocaleDateString() : '-'}</span>
    },
    { key: 'inspector', label: 'Inspector', render: (v) => v ?? '-' },
    {
      key: 'tenant_notified', label: 'Tenant Notified',
      render: (v) => v
        ? <CheckSquare size={16} className="text-green-600" />
        : <Square size={16} className="text-slate-400" />
    },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <button
          onClick={() => openComplete(row)}
          className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          Complete
        </button>
      )
    },
  ]

  const completedColumns = [
    { key: 'property', label: 'Property', render: (v, row) => <span className="font-medium">{row.property_name ?? row.property ?? '-'}</span> },
    { key: 'inspection_type', label: 'Type', render: (v) => <TypeBadge value={v} /> },
    { key: 'scheduled_date', label: 'Scheduled', render: (v) => v ? new Date(v).toLocaleDateString() : '-' },
    { key: 'actual_date', label: 'Completed', render: (v) => v ? new Date(v).toLocaleDateString() : '-' },
    { key: 'overall_condition', label: 'Condition', render: (v) => <Badge value={v} /> },
    { key: 'inspector', label: 'Inspector', render: (v) => v ?? '-' },
    { key: 'action_required', label: 'Action Required', render: (v) => v ? <span className="text-red-600 font-semibold text-xs">YES</span> : <span className="text-green-600 text-xs">No</span> },
  ]

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1'

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Property Inspections</h1>
          <p className="text-sm text-slate-500 mt-0.5">Schedule, manage and record property inspections</p>
        </div>
        <button
          onClick={() => setScheduleModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Schedule Inspection
        </button>
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-sm font-medium text-red-700">
            {overdueCount} inspection{overdueCount !== 1 ? 's are' : ' is'} overdue and require immediate attention.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon={ClipboardCheck} label="Total" value={stats?.total ?? '-'} color="blue" />
        <StatCard icon={Clock} label="Scheduled" value={stats?.scheduled ?? '-'} color="blue" />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats?.overdue ?? overdueCount} color="red" />
        <StatCard icon={CheckCircle2} label="Completed" value={stats?.completed ?? '-'} color="green" />
        <StatCard icon={AlertTriangle} label="Action Required" value={stats?.action_required ?? '-'} color="orange" />
        <StatCard icon={CalendarDays} label="Due This Week" value={stats?.due_this_week ?? '-'} color="purple" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: 'scheduled', label: 'Scheduled & Active' },
          { key: 'completed', label: 'Completed' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tables */}
      {activeTab === 'scheduled' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Scheduled & Active Inspections</h2>
          </div>
          <Table columns={scheduledColumns} data={scheduled} loading={loading} emptyMessage="No scheduled inspections" />
        </div>
      )}

      {activeTab === 'completed' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Completed Inspections</h2>
          </div>
          <Table columns={completedColumns} data={completed} loading={loading} emptyMessage="No completed inspections" />
        </div>
      )}

      {/* Complete Inspection Modal */}
      {completeModal && (
        <Modal open={true} onClose={() => setCompleteModal(false)} title="Complete Inspection" size="sm">
          <form onSubmit={handleComplete} className="space-y-4">
            <div>
              <label className={labelCls}>Actual Date</label>
              <input type="date" className={inputCls} value={completeForm.actual_date}
                onChange={e => setCompleteForm(f => ({ ...f, actual_date: e.target.value }))} required />
            </div>
            <div>
              <label className={labelCls}>Overall Condition</label>
              <select className={inputCls} value={completeForm.overall_condition}
                onChange={e => setCompleteForm(f => ({ ...f, overall_condition: e.target.value }))}>
                {['excellent', 'good', 'fair', 'poor'].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Report Summary</label>
              <textarea className={inputCls} rows={3} value={completeForm.report_summary}
                onChange={e => setCompleteForm(f => ({ ...f, report_summary: e.target.value }))}
                placeholder="Summary of inspection findings..." />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="action_req" checked={completeForm.action_required}
                onChange={e => setCompleteForm(f => ({ ...f, action_required: e.target.checked }))}
                className="rounded" />
              <label htmlFor="action_req" className="text-sm font-medium text-slate-700">Action Required</label>
            </div>
            {completeForm.action_required && (
              <div>
                <label className={labelCls}>Action Description</label>
                <textarea className={inputCls} rows={2} value={completeForm.action_description}
                  onChange={e => setCompleteForm(f => ({ ...f, action_description: e.target.value }))}
                  placeholder="Describe required actions..." />
              </div>
            )}
            <div>
              <label className={labelCls}>Next Inspection Date</label>
              <input type="date" className={inputCls} value={completeForm.next_inspection_date}
                onChange={e => setCompleteForm(f => ({ ...f, next_inspection_date: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setCompleteModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={completing}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {completing ? 'Saving...' : 'Mark Complete'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Schedule Inspection Modal */}
      {scheduleModal && (
        <Modal open={true} onClose={() => setScheduleModal(false)} title="Schedule Inspection" size="md">
          <form onSubmit={handleSchedule} className="space-y-4">
            <div>
              <label className={labelCls}>Property</label>
              <select className={inputCls} value={scheduleForm.property_id}
                onChange={e => setScheduleForm(f => ({ ...f, property_id: e.target.value }))} required>
                <option value="">Select property...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name ?? p.address}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Inspection Type</label>
              <select className={inputCls} value={scheduleForm.inspection_type}
                onChange={e => setScheduleForm(f => ({ ...f, inspection_type: e.target.value }))}>
                {Object.keys(TYPE_COLORS).map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Scheduled Date</label>
              <input type="date" className={inputCls} value={scheduleForm.scheduled_date}
                onChange={e => setScheduleForm(f => ({ ...f, scheduled_date: e.target.value }))} required />
            </div>
            <div>
              <label className={labelCls}>Inspector</label>
              <input type="text" className={inputCls} value={scheduleForm.inspector}
                onChange={e => setScheduleForm(f => ({ ...f, inspector: e.target.value }))}
                placeholder="Inspector name" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="tn" checked={scheduleForm.tenant_notified}
                onChange={e => setScheduleForm(f => ({ ...f, tenant_notified: e.target.checked }))}
                className="rounded" />
              <label htmlFor="tn" className="text-sm font-medium text-slate-700">Tenant Notified</label>
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea className={inputCls} rows={2} value={scheduleForm.notes}
                onChange={e => setScheduleForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional notes..." />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setScheduleModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={scheduling}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {scheduling ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
