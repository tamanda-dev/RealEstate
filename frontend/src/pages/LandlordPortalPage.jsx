import { useState, useEffect, useCallback } from 'react'
import { DollarSign, TrendingUp, Percent, FileText, BarChart2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import { useToast } from '../context/ToastContext'
import { lettingsAPI, reportsAPI, usersAPI, propertiesAPI, maintenanceAPI } from '../services/api'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2]

const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1'

export default function LandlordPortalPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('disbursements')

  // Shared data
  const [properties, setProperties] = useState([])
  const [owners, setOwners] = useState([])
  useEffect(() => {
    propertiesAPI.list().then(r => setProperties(Array.isArray(r.data) ? r.data : r.data?.results ?? [])).catch(() => {})
    usersAPI.list().then(r => {
      const all = Array.isArray(r.data) ? r.data : r.data?.results ?? []
      setOwners(all.filter(u => u.role === 'owner' || u.role === 'admin'))
    }).catch(() => {})
  }, [])

  // ── DISBURSEMENTS TAB ──
  const [disbFilter, setDisbFilter] = useState({ property_id: '', month: new Date().getMonth() + 1, year: currentYear })
  const [disbursements, setDisbursements] = useState([])
  const [disbLoading, setDisbLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [commissionRate, setCommissionRate] = useState(10)

  // Mark paid modal
  const [paidModal, setPaidModal] = useState(false)
  const [paidRow, setPaidRow] = useState(null)
  const [paidForm, setPaidForm] = useState({ paid_date: '', payment_method: '', reference: '' })
  const [markingPaid, setMarkingPaid] = useState(false)

  const loadDisbursements = useCallback(async () => {
    setDisbLoading(true)
    try {
      const res = await lettingsAPI.disbursements.list(disbFilter)
      setDisbursements(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast.toast('Failed to load disbursements', 'error')
    } finally {
      setDisbLoading(false)
    }
  }, [disbFilter])

  useEffect(() => { loadDisbursements() }, [loadDisbursements])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await lettingsAPI.disbursements.generate({
        property_id: disbFilter.property_id,
        month: disbFilter.month,
        year: disbFilter.year,
        agent_commission_rate: commissionRate,
      })
      toast.toast('Disbursement generated', 'success')
      loadDisbursements()
    } catch {
      toast.toast('Failed to generate disbursement', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const openPaid = (row) => {
    setPaidRow(row)
    setPaidForm({ paid_date: new Date().toISOString().slice(0, 10), payment_method: '', reference: '' })
    setPaidModal(true)
  }

  const handleMarkPaid = async (e) => {
    e.preventDefault()
    setMarkingPaid(true)
    try {
      await lettingsAPI.disbursements.markPaid(paidRow.id, paidForm)
      toast.toast('Disbursement marked as paid', 'success')
      setPaidModal(false)
      loadDisbursements()
    } catch {
      toast.toast('Failed to mark paid', 'error')
    } finally {
      setMarkingPaid(false)
    }
  }

  const disbColumns = [
    { key: 'property_name', label: 'Property', render: (v, row) => <span className="font-medium">{v ?? row.property}</span> },
    { key: 'owner_name', label: 'Landlord', render: v => v || '—' },
    {
      key: 'period', label: 'Period',
      render: (v, row) => {
        const m = row.period_month ? MONTHS[row.period_month - 1] : ''
        return `${m} ${row.period_year ?? ''}`
      }
    },
    { key: 'gross_rent_usd', label: 'Gross Rent USD', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'agent_commission_usd', label: 'Commission', render: (v, row) => `$${Number(v ?? 0).toLocaleString()} (${Number(row.agent_commission_rate ?? 0)}%)` },
    { key: 'vat_on_commission_usd', label: 'VAT on Commission', render: (v, row) => `$${Number(v ?? 0).toLocaleString()} (${Number(row.vat_rate ?? 0)}%)` },
    {
      key: 'net_to_landlord_usd', label: 'Net to Landlord',
      render: (v, row) => (
        <div>
          <span className="font-bold text-green-700">${Number(v ?? 0).toLocaleString()}</span>
          {row.net_to_landlord_zig && (
            <div className="text-xs text-slate-400">ZiG {Number(row.net_to_landlord_zig).toLocaleString()}</div>
          )}
        </div>
      )
    },
    { key: 'status', label: 'Status', render: v => <Badge value={v} /> },
    {
      key: 'actions', label: '',
      render: (_, row) => row.status !== 'paid' ? (
        <button onClick={() => openPaid(row)}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
          Mark Paid
        </button>
      ) : null
    },
  ]

  // ── CONTRACTORS TAB ──
  const [myApprovals, setMyApprovals] = useState([])
  const [availableVendors, setAvailableVendors] = useState([])
  const [contractorPropFilter, setContractorPropFilter] = useState('')
  const [approving, setApproving] = useState(null)

  const loadApprovals = useCallback(async () => {
    try {
      const res = await maintenanceAPI.approvedContractors.list()
      setMyApprovals(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast.toast('Failed to load approved contractors', 'error')
    }
  }, [])

  const loadAvailableVendors = useCallback(async () => {
    try {
      const res = await maintenanceAPI.approvedContractors.availableVendors(
        contractorPropFilter ? { property: contractorPropFilter } : {}
      )
      setAvailableVendors(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast.toast('Failed to load vendor directory', 'error')
    }
  }, [contractorPropFilter])

  useEffect(() => {
    if (activeTab === 'contractors') { loadApprovals(); loadAvailableVendors() }
  }, [activeTab, loadApprovals, loadAvailableVendors])

  const handleApprove = async (vendorId) => {
    setApproving(vendorId)
    try {
      await maintenanceAPI.approvedContractors.approve({
        vendor: vendorId, property: contractorPropFilter || null,
      })
      toast.toast('Contractor approved', 'success')
      loadApprovals()
      loadAvailableVendors()
    } catch (err) {
      toast.toast(err?.response?.data?.detail ?? 'Failed to approve contractor', 'error')
    } finally {
      setApproving(null)
    }
  }

  const handleRevoke = async (id) => {
    if (!window.confirm('Revoke approval for this contractor?')) return
    try {
      await maintenanceAPI.approvedContractors.revoke(id)
      toast.toast('Approval revoked', 'success')
      loadApprovals()
      loadAvailableVendors()
    } catch {
      toast.toast('Failed to revoke approval', 'error')
    }
  }

  const approvalColumns = [
    { key: 'contractor_name', label: 'Contractor', render: (_, row) => <span className="font-medium">{row.vendor_detail?.name}</span> },
    { key: 'contractor_category', label: 'Category', render: (_, row) => <Badge value={row.vendor_detail?.category} /> },
    { key: 'contractor_phone', label: 'Phone', render: (_, row) => row.vendor_detail?.phone ?? '—' },
    { key: 'property_name', label: 'Property', render: (v) => v ?? 'All Properties' },
    { key: 'contractor_rating', label: 'Rating', render: (_, row) => row.vendor_detail?.rating ? `★ ${row.vendor_detail.rating}` : '—' },
    {
      key: 'id', label: '',
      render: (v) => (
        <button onClick={() => handleRevoke(v)}
          className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100">
          Revoke
        </button>
      ),
    },
  ]

  // ── BULK PAYMENTS TAB ──
  const [approvedDisbs, setApprovedDisbs] = useState([])
  const [selectedDisbIds, setSelectedDisbIds] = useState([])
  const [batches, setBatches] = useState([])
  const [batchForm, setBatchForm] = useState({
    name: '', scheduled_date: new Date().toISOString().slice(0, 10), payment_method: '',
  })
  const [creatingBatch, setCreatingBatch] = useState(false)
  const [executingId, setExecutingId] = useState(null)

  const loadApprovedDisbs = useCallback(async () => {
    try {
      const res = await lettingsAPI.disbursements.list({ status: 'approved' })
      setApprovedDisbs(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast.toast('Failed to load approved disbursements', 'error')
    }
  }, [])

  const loadBatches = useCallback(async () => {
    try {
      const res = await lettingsAPI.bulkPayments.list()
      setBatches(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast.toast('Failed to load bulk payment batches', 'error')
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'bulk') { loadApprovedDisbs(); loadBatches() }
  }, [activeTab, loadApprovedDisbs, loadBatches])

  const toggleDisb = (id) => {
    setSelectedDisbIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }

  const selectedTotal = approvedDisbs
    .filter((d) => selectedDisbIds.includes(d.id))
    .reduce((sum, d) => sum + Number(d.net_to_landlord_usd ?? 0), 0)

  const handleCreateBatch = async (e) => {
    e.preventDefault()
    if (selectedDisbIds.length === 0) { toast.toast('Select at least one disbursement', 'warning'); return }
    setCreatingBatch(true)
    try {
      const isFuture = batchForm.scheduled_date > new Date().toISOString().slice(0, 10)
      await lettingsAPI.bulkPayments.create({ ...batchForm, disbursement_ids: selectedDisbIds })
      toast.toast(isFuture ? 'Batch scheduled' : 'Batch created — ready to execute', 'success')
      setSelectedDisbIds([])
      setBatchForm({ name: '', scheduled_date: new Date().toISOString().slice(0, 10), payment_method: '' })
      loadBatches()
      loadApprovedDisbs()
    } catch (err) {
      toast.toast(err?.response?.data?.error ?? 'Failed to create batch', 'error')
    } finally {
      setCreatingBatch(false)
    }
  }

  const handleExecuteBatch = async (id) => {
    setExecutingId(id)
    try {
      const res = await lettingsAPI.bulkPayments.execute(id)
      toast.toast(`Executed: ${res.data.paid_count} paid, ${res.data.failed_count} failed`, 'success')
      loadBatches()
      loadApprovedDisbs()
    } catch (err) {
      toast.toast(err?.response?.data?.error ?? 'Failed to execute batch', 'error')
    } finally {
      setExecutingId(null)
    }
  }

  const handleCancelBatch = async (id) => {
    if (!window.confirm('Cancel this batch?')) return
    try {
      await lettingsAPI.bulkPayments.cancel(id)
      toast.toast('Batch cancelled', 'success')
      loadBatches()
    } catch (err) {
      toast.toast(err?.response?.data?.error ?? 'Failed to cancel batch', 'error')
    }
  }

  const batchColumns = [
    { key: 'name', label: 'Batch' },
    { key: 'scheduled_date', label: 'Scheduled Date' },
    { key: 'item_count', label: 'Items' },
    { key: 'total_amount_usd', label: 'Total', render: (v) => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex gap-2">
          {['draft', 'scheduled'].includes(row.status) && (
            <button onClick={() => handleExecuteBatch(row.id)} disabled={executingId === row.id}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
              {executingId === row.id ? 'Executing…' : 'Execute Now'}
            </button>
          )}
          {['draft', 'scheduled'].includes(row.status) && (
            <button onClick={() => handleCancelBatch(row.id)}
              className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100">
              Cancel
            </button>
          )}
        </div>
      ),
    },
  ]

  // ── ANNUAL STATEMENT TAB ──
  const [annualOwner, setAnnualOwner] = useState('')
  const [annualYear, setAnnualYear] = useState(currentYear)
  const [annualData, setAnnualData] = useState(null)
  const [annualLoading, setAnnualLoading] = useState(false)

  const loadAnnual = async () => {
    if (!annualOwner) { toast.toast('Select an owner first', 'warning'); return }
    setAnnualLoading(true)
    try {
      const res = await lettingsAPI.disbursements.annualStatement({ owner: annualOwner, year: annualYear })
      setAnnualData(res.data)
    } catch {
      toast.toast('Failed to load annual statement', 'error')
    } finally {
      setAnnualLoading(false)
    }
  }

  const annualSummary = annualData?.summary ?? {}
  const annualDisbs = annualData?.disbursements ?? []
  const annualChartData = MONTHS.map((m, i) => {
    const row = annualDisbs.find(d => d.period_month === i + 1) ?? {}
    return { month: m, revenue: Number(row.gross_rent_usd ?? 0), net: Number(row.net_to_landlord_usd ?? 0) }
  })

  const annualTableCols = [
    { key: 'property_name', label: 'Property', render: (v, r) => v ?? r.property },
    { key: 'owner_name', label: 'Landlord', render: v => v || '—' },
    { key: 'period_month', label: 'Month', render: v => MONTHS[(v ?? 1) - 1] },
    { key: 'gross_rent_usd', label: 'Gross Rent', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'agent_commission_usd', label: 'Commission', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'vat_on_commission_usd', label: 'VAT', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'net_to_landlord_usd', label: 'Net to Landlord', render: v => <span className="font-bold text-green-700">${Number(v ?? 0).toLocaleString()}</span> },
    { key: 'status', label: 'Status', render: v => <Badge value={v} /> },
  ]

  // ── RENT PER SQM TAB ──
  const [sqmFilter, setSqmFilter] = useState({ property_type: '', city: '' })
  const [sqmData, setSqmData] = useState([])
  const [sqmLoading, setSqmLoading] = useState(false)

  const loadSqm = async () => {
    setSqmLoading(true)
    try {
      const res = await reportsAPI.rentPerSqm(sqmFilter)
      setSqmData(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast.toast('Failed to load rent/m² report', 'error')
    } finally {
      setSqmLoading(false)
    }
  }

  const sqmAvg = sqmData.length ? (sqmData.reduce((a, r) => a + Number(r.rent_per_sqm_usd ?? 0), 0) / sqmData.length).toFixed(2) : 0
  const sqmMax = sqmData.length ? Math.max(...sqmData.map(r => Number(r.rent_per_sqm_usd ?? 0))).toFixed(2) : 0
  const sqmMin = sqmData.length ? Math.min(...sqmData.map(r => Number(r.rent_per_sqm_usd ?? 0))).toFixed(2) : 0

  const sqmColumns = [
    { key: 'property_name', label: 'Property', render: v => <span className="font-medium">{v}</span> },
    { key: 'city', label: 'City' },
    { key: 'property_type', label: 'Type' },
    { key: 'floor_area_sqm', label: 'Floor Area (m²)', render: v => `${Number(v ?? 0).toLocaleString()} m²` },
    { key: 'monthly_rent_usd', label: 'Monthly Rent', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    {
      key: 'rent_per_sqm_usd', label: 'Rent/m² USD',
      render: v => <span className="font-bold text-blue-700">${Number(v ?? 0).toFixed(2)}</span>
    },
    { key: 'annual_rent_usd', label: 'Annual Rent', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'gross_yield_pct', label: 'Gross Yield %', render: v => `${Number(v ?? 0).toFixed(1)}%` },
  ]

  const sqmChartData = sqmData.slice(0, 20).map(r => ({
    name: (r.property_name ?? '').slice(0, 15),
    rent_per_sqm: Number(r.rent_per_sqm_usd ?? 0),
  }))

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Landlord Portal</h1>
        <p className="text-sm text-slate-500 mt-0.5">Disbursements, statements and rent analytics</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {[
          { key: 'disbursements', label: 'Monthly Disbursements' },
          { key: 'bulk', label: 'Bulk Payments' },
          { key: 'contractors', label: 'Contractors' },
          { key: 'annual', label: 'Annual Statement' },
          { key: 'sqm', label: 'Rent per SqM' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DISBURSEMENTS ── */}
      {activeTab === 'disbursements' && (
        <div className="space-y-4">
          {/* Filter row */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className={labelCls}>Property</label>
                <select className={inputCls} value={disbFilter.property_id}
                  onChange={e => setDisbFilter(f => ({ ...f, property_id: e.target.value }))}>
                  <option value="">All Properties</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name ?? p.address}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Month</label>
                <select className={inputCls} value={disbFilter.month}
                  onChange={e => setDisbFilter(f => ({ ...f, month: Number(e.target.value) }))}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Year</label>
                <select className={inputCls} value={disbFilter.year}
                  onChange={e => setDisbFilter(f => ({ ...f, year: Number(e.target.value) }))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Commission Rate %</label>
                <input type="number" className={inputCls} style={{ width: 100 }} value={commissionRate}
                  onChange={e => setCommissionRate(Number(e.target.value))} min={0} max={100} step={0.5} />
              </div>
              <button onClick={handleGenerate} disabled={generating}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {generating ? 'Generating...' : 'Generate Disbursement'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Disbursements</h2>
            </div>
            <Table columns={disbColumns} data={disbursements} loading={disbLoading} emptyMessage="No disbursements found" />
          </div>
        </div>
      )}

      {/* ── BULK PAYMENTS ── */}
      {activeTab === 'bulk' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-3">1. Select Approved Disbursements to Pay</h2>
            <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
              {approvedDisbs.length === 0 && (
                <p className="p-4 text-sm text-slate-400">No approved disbursements awaiting payment.</p>
              )}
              {approvedDisbs.map((d) => (
                <label key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedDisbIds.includes(d.id)} onChange={() => toggleDisb(d.id)} />
                  <span className="flex-1">
                    {d.property_name ?? d.property} — {MONTHS[(d.period_month ?? 1) - 1]} {d.period_year}
                    <span className="text-slate-400"> ({d.owner_name})</span>
                  </span>
                  <span className="font-semibold text-green-700">${Number(d.net_to_landlord_usd ?? 0).toLocaleString()}</span>
                </label>
              ))}
            </div>

            <form onSubmit={handleCreateBatch} className="flex flex-wrap gap-3 items-end mt-4 pt-4 border-t border-slate-100">
              <div>
                <label className={labelCls}>Batch Name</label>
                <input type="text" className={inputCls} value={batchForm.name}
                  onChange={(e) => setBatchForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. October Landlord Payout" />
              </div>
              <div>
                <label className={labelCls}>Execute On</label>
                <input type="date" className={inputCls} required value={batchForm.scheduled_date}
                  onChange={(e) => setBatchForm((f) => ({ ...f, scheduled_date: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Payment Method</label>
                <input type="text" className={inputCls} value={batchForm.payment_method}
                  onChange={(e) => setBatchForm((f) => ({ ...f, payment_method: e.target.value }))}
                  placeholder="e.g. bank_transfer" />
              </div>
              <div className="text-sm text-slate-600">
                Selected: <span className="font-semibold">{selectedDisbIds.length}</span> · Total:{' '}
                <span className="font-bold text-green-700">${selectedTotal.toLocaleString()}</span>
              </div>
              <button type="submit" disabled={creatingBatch}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {creatingBatch ? 'Creating…' : batchForm.scheduled_date > new Date().toISOString().slice(0, 10) ? 'Schedule Batch' : 'Create Batch'}
              </button>
            </form>
            <p className="text-xs text-slate-400 mt-2">
              A future date schedules the batch — it runs automatically when the scheduler task reaches that date.
              Today's date executes immediately once you click "Execute Now" below.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">2. Batches</h2>
            </div>
            <Table columns={batchColumns} data={batches} loading={false} emptyMessage="No bulk payment batches yet" />
          </div>
        </div>
      )}

      {/* ── CONTRACTORS ── */}
      {activeTab === 'contractors' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">My Approved Contractors</h2>
              <p className="text-xs text-slate-400 mt-0.5">Contractors you've approved to work on your properties.</p>
            </div>
            <Table columns={approvalColumns} data={myApprovals} loading={false} emptyMessage="You haven't approved any contractors yet." />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-slate-800">Vendor Directory</h2>
                <p className="text-xs text-slate-400 mt-0.5">Approve a contractor for a specific property, or leave blank to approve for all your properties.</p>
              </div>
              <div>
                <label className={labelCls}>Approve for Property</label>
                <select className={inputCls} value={contractorPropFilter}
                  onChange={(e) => setContractorPropFilter(e.target.value)}>
                  <option value="">All My Properties</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.address}</option>)}
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {availableVendors.length === 0 && (
                <p className="text-sm text-slate-400 col-span-full">No unapproved contractors available in the directory.</p>
              )}
              {availableVendors.map((v) => (
                <div key={v.id} className="border border-slate-100 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{v.name}</span>
                    <Badge value={v.category} />
                  </div>
                  <p className="text-xs text-slate-500">{v.phone}{v.email ? ` · ${v.email}` : ''}</p>
                  {v.rating > 0 && <p className="text-xs text-amber-500">★ {v.rating}</p>}
                  <button onClick={() => handleApprove(v.id)} disabled={approving === v.id}
                    className="mt-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {approving === v.id ? 'Approving…' : 'Approve Contractor'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ANNUAL STATEMENT ── */}
      {activeTab === 'annual' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className={labelCls}>Owner</label>
                <select className={inputCls} value={annualOwner} onChange={e => setAnnualOwner(e.target.value)}>
                  <option value="">Select owner...</option>
                  {owners.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Year</label>
                <select className={inputCls} value={annualYear} onChange={e => setAnnualYear(Number(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={loadAnnual} disabled={annualLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {annualLoading ? 'Loading...' : 'Load Statement'}
              </button>
            </div>
          </div>

          {annualData && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={DollarSign} label="Annual Gross Rent" value={`$${Number(annualSummary.total_gross ?? 0).toLocaleString()}`} color="blue" />
                <StatCard icon={Percent} label="Total Commission" value={`$${Number(annualSummary.total_commission ?? 0).toLocaleString()}`} color="orange" />
                <StatCard icon={FileText} label="Total VAT" value={`$${Number(annualSummary.total_vat ?? 0).toLocaleString()}`} color="purple" />
                <StatCard icon={TrendingUp} label="Net to Landlord" value={`$${Number(annualSummary.total_net ?? 0).toLocaleString()}`} color="green" />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-800 mb-4">Monthly Revenue vs Net Disbursed ({annualYear})</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={annualChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                    <Tooltip formatter={v => `$${Number(v).toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="revenue" name="Gross Revenue" fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="net" name="Net to Landlord" fill="#22c55e" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Disbursement Details</h2>
                </div>
                <Table columns={annualTableCols} data={annualDisbs} loading={false} emptyMessage="No disbursement data" />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── RENT PER SQM ── */}
      {activeTab === 'sqm' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className={labelCls}>Property Type</label>
                <input type="text" className={inputCls} value={sqmFilter.property_type}
                  onChange={e => setSqmFilter(f => ({ ...f, property_type: e.target.value }))}
                  placeholder="e.g. apartment, office..." />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input type="text" className={inputCls} value={sqmFilter.city}
                  onChange={e => setSqmFilter(f => ({ ...f, city: e.target.value }))}
                  placeholder="e.g. Harare" />
              </div>
              <button onClick={loadSqm} disabled={sqmLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {sqmLoading ? 'Loading...' : 'Load Report'}
              </button>
            </div>
          </div>

          {sqmData.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard icon={BarChart2} label="Avg Rent/m²" value={`$${sqmAvg}`} color="blue" />
                <StatCard icon={TrendingUp} label="Max Rent/m²" value={`$${sqmMax}`} color="green" />
                <StatCard icon={DollarSign} label="Min Rent/m²" value={`$${sqmMin}`} color="orange" />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-800 mb-4">Rent per m² by Property</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={sqmChartData} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                    <Tooltip formatter={v => `$${Number(v).toFixed(2)}/m²`} />
                    <Bar dataKey="rent_per_sqm" name="Rent/m² USD" fill="#3b82f6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Rent per m² Report</h2>
                </div>
                <Table columns={sqmColumns} data={sqmData} loading={sqmLoading} emptyMessage="No data found" />
              </div>
            </>
          )}
        </div>
      )}

      {/* Mark Paid Modal */}
      {paidModal && (
        <Modal open={true} onClose={() => setPaidModal(false)} title="Mark Disbursement as Paid" size="sm">
          <form onSubmit={handleMarkPaid} className="space-y-4">
            <div>
              <label className={labelCls}>Paid Date</label>
              <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={paidForm.paid_date}
                onChange={e => setPaidForm(f => ({ ...f, paid_date: e.target.value }))} required />
            </div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={paidForm.payment_method}
                onChange={e => setPaidForm(f => ({ ...f, payment_method: e.target.value }))}
                placeholder="e.g. Bank Transfer, RTGS..." />
            </div>
            <div>
              <label className={labelCls}>Reference</label>
              <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={paidForm.reference}
                onChange={e => setPaidForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="Transaction reference" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setPaidModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={markingPaid}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {markingPaid ? 'Saving...' : 'Mark Paid'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
