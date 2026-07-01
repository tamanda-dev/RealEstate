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
import { lettingsAPI, reportsAPI, usersAPI, propertiesAPI } from '../services/api'

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
    {
      key: 'period', label: 'Period',
      render: (v, row) => {
        const m = row.month ? MONTHS[row.month - 1] : ''
        return `${m} ${row.year ?? ''}`
      }
    },
    { key: 'gross_rent_usd', label: 'Gross Rent USD', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'commission_usd', label: 'Commission (10%)', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'vat_on_commission', label: 'VAT on Commission (15%)', render: v => `$${Number(v ?? 0).toLocaleString()}` },
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

  const annualDisbs = annualData?.disbursements ?? []
  const annualChartData = MONTHS.map((m, i) => {
    const row = annualDisbs.find(d => d.month === i + 1) ?? {}
    return { month: m, revenue: Number(row.gross_rent_usd ?? 0), net: Number(row.net_to_landlord_usd ?? 0) }
  })

  const annualTableCols = [
    { key: 'property_name', label: 'Property', render: (v, r) => v ?? r.property },
    { key: 'month', label: 'Month', render: v => MONTHS[(v ?? 1) - 1] },
    { key: 'gross_rent_usd', label: 'Gross Rent', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'commission_usd', label: 'Commission', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'vat_on_commission', label: 'VAT', render: v => `$${Number(v ?? 0).toLocaleString()}` },
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
                <StatCard icon={DollarSign} label="Annual Gross Rent" value={`$${Number(annualData.annual_gross_rent ?? 0).toLocaleString()}`} color="blue" />
                <StatCard icon={Percent} label="Total Commission" value={`$${Number(annualData.total_commission ?? 0).toLocaleString()}`} color="orange" />
                <StatCard icon={FileText} label="Total VAT" value={`$${Number(annualData.total_vat ?? 0).toLocaleString()}`} color="purple" />
                <StatCard icon={TrendingUp} label="Net to Landlord" value={`$${Number(annualData.net_to_landlord ?? 0).toLocaleString()}`} color="green" />
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
