import { useState, useEffect } from 'react'
import { Plus, Search, Copy, Printer, DollarSign, TrendingUp, BarChart2 } from 'lucide-react'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import { useToast } from '../context/ToastContext'
import { valuationExtAPI, propertiesAPI, valuationAPI } from '../services/api'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1'
const PROPERTY_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'land', label: 'Land / Stand' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'mixed', label: 'Mixed Use' },
]

const SOURCE_OPTIONS = [
  { value: 'deeds_registry', label: 'Deeds Registry' },
  { value: 'agent_confirmed', label: 'Agent Confirmed' },
  { value: 'newspaper', label: 'Herald / NewsDay' },
  { value: 'own_sale', label: 'In-House Sale' },
  { value: 'other_valuer', label: 'Other Valuer' },
  { value: 'other', label: 'Other' },
]

export default function ValuationWorkbenchPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('comparables')
  const [properties, setProperties] = useState([])
  const [valuations, setValuations] = useState([])

  useEffect(() => {
    propertiesAPI.list().then(r => setProperties(Array.isArray(r.data) ? r.data : r.data?.results ?? [])).catch(() => {})
    valuationAPI.list().then(r => setValuations(Array.isArray(r.data) ? r.data : r.data?.results ?? [])).catch(() => {})
  }, [])

  // ── COMPARABLES ──
  const [compSearch, setCompSearch] = useState({
    suburb: '', city: '', property_type: '', min_land_size: '', max_land_size: '',
    date_from: '', date_to: '', bedrooms: '', verified_only: false,
  })
  const [compResults, setCompResults] = useState([])
  const [compLoading, setCompLoading] = useState(false)
  const [compStats, setCompStats] = useState(null)

  // Add comparable modal
  const [addModal, setAddModal] = useState(false)
  const [addForm, setAddForm] = useState({
    address: '', suburb: '', city: '', property_type: '',
    land_size_sqm: '', floor_area_sqm: '', bedrooms: '', bathrooms: '',
    sale_price_usd: '', sale_date: '', source: '', verified: false, notes: '',
  })
  const [adding, setAdding] = useState(false)

  const searchComparables = async (e) => {
    e.preventDefault()
    setCompLoading(true)
    try {
      const res = await valuationExtAPI.salesComparables.search({
        ...compSearch,
        min_land_sqm: compSearch.min_land_size,
        max_land_sqm: compSearch.max_land_size,
      })
      const data = res.data?.comparables ?? (Array.isArray(res.data) ? res.data : res.data?.results ?? [])
      setCompResults(data)
      if (data.length) {
        const stats = res.data?.statistics
        setCompStats({
          count: data.length,
          avg_price: stats?.avg_price ?? 0,
          min_price: stats?.min_price ?? 0,
          max_price: stats?.max_price ?? 0,
          avg_sqm: stats?.avg_price_per_sqm ?? 0,
        })
      } else {
        setCompStats(null)
      }
    } catch {
      toast.toast('Search failed', 'error')
    } finally {
      setCompLoading(false)
    }
  }

  const handleAddComparable = async (e) => {
    e.preventDefault()
    setAdding(true)
    try {
      await valuationExtAPI.salesComparables.create(addForm)
      toast.toast('Comparable added successfully', 'success')
      setAddModal(false)
      setAddForm({
        address: '', suburb: '', city: '', property_type: '',
        land_size_sqm: '', floor_area_sqm: '', bedrooms: '', bathrooms: '',
        sale_price_usd: '', sale_date: '', source: '', verified: false, notes: '',
      })
    } catch {
      toast.toast('Failed to add comparable', 'error')
    } finally {
      setAdding(false)
    }
  }

  const compColumns = [
    { key: 'address', label: 'Address', render: v => <span className="font-medium text-slate-800">{v}</span> },
    { key: 'suburb', label: 'Suburb' },
    { key: 'city', label: 'City' },
    { key: 'property_type', label: 'Type' },
    { key: 'land_size_sqm', label: 'Land (m²)', render: v => v ? `${Number(v).toLocaleString()} m²` : '-' },
    { key: 'floor_area_sqm', label: 'Floor (m²)', render: v => v ? `${Number(v).toLocaleString()} m²` : '-' },
    {
      key: 'beds_baths', label: 'Beds/Baths',
      render: (_, row) => `${row.bedrooms ?? '-'}/${row.bathrooms ?? '-'}`
    },
    { key: 'sale_price_usd', label: 'Sale Price USD', render: v => <span className="font-semibold">${Number(v ?? 0).toLocaleString()}</span> },
    { key: 'price_per_sqm_land_usd', label: 'Price/m² Land', render: v => v ? `$${Number(v).toFixed(0)}/m²` : '-' },
    { key: 'sale_date', label: 'Sale Date', render: v => v ? new Date(v).toLocaleDateString() : '-' },
    { key: 'verified', label: 'Verified', render: v => v ? <Badge value="Verified" /> : <Badge value="Unverified" /> },
    { key: 'source', label: 'Source', render: v => v ? <Badge value={v} /> : '-' },
  ]

  // ── INVESTMENT APPROACH ──
  const [invForm, setInvForm] = useState({
    property_id: '', gross_annual_rent: '', vacancy_rate: 5,
    operating_expenses_pct: 25, cap_rate: 8,
  })
  const [invResult, setInvResult] = useState(null)
  const [invLoading, setInvLoading] = useState(false)

  const calcInvestment = async (e) => {
    e.preventDefault()
    setInvLoading(true)
    try {
      const res = await valuationExtAPI.investmentApproach(invForm)
      setInvResult(res.data)
    } catch {
      toast.toast('Calculation failed', 'error')
    } finally {
      setInvLoading(false)
    }
  }

  // ── COST APPROACH ──
  const [costForm, setCostForm] = useState({
    property_id: '', land_value: '', replacement_cost: '',
    age_years: '', economic_life: 50, functional_obsolescence_pct: 0, external_obsolescence_pct: 0,
  })
  const [costResult, setCostResult] = useState(null)
  const [costLoading, setCostLoading] = useState(false)

  const calcCost = async (e) => {
    e.preventDefault()
    setCostLoading(true)
    try {
      const res = await valuationExtAPI.costApproach(costForm)
      setCostResult(res.data)
    } catch {
      toast.toast('Calculation failed', 'error')
    } finally {
      setCostLoading(false)
    }
  }

  // ── REPORT GENERATOR ──
  const [selectedValuation, setSelectedValuation] = useState('')
  const [reportPurpose, setReportPurpose] = useState('')
  const [reportText, setReportText] = useState('')
  const [reportLoading, setReportLoading] = useState(false)

  const generateReport = async () => {
    if (!selectedValuation) { toast.toast('Select a valuation first', 'warning'); return }
    setReportLoading(true)
    try {
      const res = await valuationExtAPI.generateReport(selectedValuation, { purpose: reportPurpose })
      setReportText(res.data?.report_text ?? JSON.stringify(res.data, null, 2))
      toast.toast('Report generated', 'success')
    } catch {
      toast.toast('Failed to generate report', 'error')
    } finally {
      setReportLoading(false)
    }
  }

  const copyReport = () => {
    navigator.clipboard.writeText(reportText)
    toast.toast('Copied to clipboard', 'success')
  }

  const printReport = () => { window.print() }

  // Helpers for results display
  const fmt = (n) => `$${Number(n ?? 0).toLocaleString()}`
  const fmtPct = (n) => `${Number(n ?? 0).toFixed(1)}%`

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Valuation Workbench</h1>
        <p className="text-sm text-slate-500 mt-0.5">Comparable sales, investment analysis, cost approach and report generation</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {[
          { key: 'comparables', label: 'Comparables Database' },
          { key: 'investment', label: 'Investment Approach' },
          { key: 'cost', label: 'Cost Approach' },
          { key: 'report', label: 'Report Generator' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── COMPARABLES ── */}
      {activeTab === 'comparables' && (
        <div className="space-y-4">
          {/* Search form */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Search Comparables</h2>
            <form onSubmit={searchComparables}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className={labelCls}>Suburb</label>
                  <input type="text" className={inputCls} value={compSearch.suburb}
                    onChange={e => setCompSearch(f => ({ ...f, suburb: e.target.value }))}
                    placeholder="e.g. Borrowdale" />
                </div>
                <div>
                  <label className={labelCls}>City</label>
                  <input type="text" className={inputCls} value={compSearch.city}
                    onChange={e => setCompSearch(f => ({ ...f, city: e.target.value }))}
                    placeholder="e.g. Harare" />
                </div>
                <div>
                  <label className={labelCls}>Property Type</label>
                  <select className={inputCls} value={compSearch.property_type}
                    onChange={e => setCompSearch(f => ({ ...f, property_type: e.target.value }))}>
                    <option value="">All Types</option>
                    {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Bedrooms</label>
                  <input type="number" className={inputCls} value={compSearch.bedrooms}
                    onChange={e => setCompSearch(f => ({ ...f, bedrooms: e.target.value }))}
                    placeholder="e.g. 3" min={0} />
                </div>
                <div>
                  <label className={labelCls}>Min Land Size (m²)</label>
                  <input type="number" className={inputCls} value={compSearch.min_land_size}
                    onChange={e => setCompSearch(f => ({ ...f, min_land_size: e.target.value }))}
                    placeholder="e.g. 500" min={0} />
                </div>
                <div>
                  <label className={labelCls}>Max Land Size (m²)</label>
                  <input type="number" className={inputCls} value={compSearch.max_land_size}
                    onChange={e => setCompSearch(f => ({ ...f, max_land_size: e.target.value }))}
                    placeholder="e.g. 2000" min={0} />
                </div>
                <div>
                  <label className={labelCls}>Sale Date From</label>
                  <input type="date" className={inputCls} value={compSearch.date_from}
                    onChange={e => setCompSearch(f => ({ ...f, date_from: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Sale Date To</label>
                  <input type="date" className={inputCls} value={compSearch.date_to}
                    onChange={e => setCompSearch(f => ({ ...f, date_to: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="verified_only" checked={compSearch.verified_only}
                    onChange={e => setCompSearch(f => ({ ...f, verified_only: e.target.checked }))}
                    className="rounded" />
                  <label htmlFor="verified_only" className="text-sm font-medium text-slate-700">Verified Only</label>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">
                    <Plus size={15} />
                    Add Comparable
                  </button>
                  <button type="submit" disabled={compLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    <Search size={15} />
                    {compLoading ? 'Searching...' : 'Search Comparables'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Stats */}
          {compStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard icon={BarChart2} label="Count Found" value={compStats.count} color="blue" />
              <StatCard icon={DollarSign} label="Avg Price" value={`$${Math.round(compStats.avg_price).toLocaleString()}`} color="blue" />
              <StatCard icon={TrendingUp} label="Min Price" value={`$${Math.round(compStats.min_price).toLocaleString()}`} color="green" />
              <StatCard icon={TrendingUp} label="Max Price" value={`$${Math.round(compStats.max_price).toLocaleString()}`} color="orange" />
              <StatCard icon={DollarSign} label="Avg $/m²" value={`$${Math.round(compStats.avg_sqm).toLocaleString()}`} color="purple" />
            </div>
          )}

          {/* Results table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">
                Results {compResults.length > 0 && <span className="text-slate-400 font-normal text-sm">({compResults.length} found)</span>}
              </h2>
            </div>
            <Table columns={compColumns} data={compResults} loading={compLoading} emptyMessage="Search for comparables above" />
          </div>
        </div>
      )}

      {/* ── INVESTMENT APPROACH ── */}
      {activeTab === 'investment' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-1">Income Capitalisation Approach</h2>
            <p className="text-xs text-slate-500 mb-4">Estimate property value based on rental income potential</p>
            <form onSubmit={calcInvestment} className="space-y-4">
              <div>
                <label className={labelCls}>Property (optional)</label>
                <select className={inputCls} value={invForm.property_id}
                  onChange={e => setInvForm(f => ({ ...f, property_id: e.target.value }))}>
                  <option value="">No property selected</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name ?? p.address}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Gross Annual Rent (USD)</label>
                  <input type="number" className={inputCls} value={invForm.gross_annual_rent}
                    onChange={e => setInvForm(f => ({ ...f, gross_annual_rent: e.target.value }))}
                    placeholder="e.g. 24000" min={0} required />
                </div>
                <div>
                  <label className={labelCls}>Vacancy Rate %</label>
                  <input type="number" className={inputCls} value={invForm.vacancy_rate}
                    onChange={e => setInvForm(f => ({ ...f, vacancy_rate: e.target.value }))}
                    placeholder="5" min={0} max={100} step={0.5} />
                </div>
                <div>
                  <label className={labelCls}>Operating Expenses %</label>
                  <input type="number" className={inputCls} value={invForm.operating_expenses_pct}
                    onChange={e => setInvForm(f => ({ ...f, operating_expenses_pct: e.target.value }))}
                    placeholder="25" min={0} max={100} step={0.5} />
                </div>
                <div>
                  <label className={labelCls}>Cap Rate % (Zimbabwe typical 8%)</label>
                  <input type="number" className={inputCls} value={invForm.cap_rate}
                    onChange={e => setInvForm(f => ({ ...f, cap_rate: e.target.value }))}
                    placeholder="8" min={0.1} max={50} step={0.1} />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={invLoading}
                  className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {invLoading ? 'Calculating...' : 'Calculate'}
                </button>
              </div>
            </form>
          </div>

          {invResult && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Valuation Results</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Line Item</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-5 py-3 text-sm text-slate-700">Gross Annual Rental Income</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-700">{fmt(invResult.gross_annual_rent)}</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-red-600">Less: Vacancy Allowance ({invForm.vacancy_rate}%)</td>
                      <td className="px-5 py-3 text-sm text-right text-red-600">({fmt(invResult.vacancy_allowance)})</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">Effective Gross Income</td>
                      <td className="px-5 py-3 text-sm font-medium text-right text-slate-800">{fmt(invResult.effective_gross_income)}</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-red-600">Less: Operating Expenses ({invForm.operating_expenses_pct}%)</td>
                      <td className="px-5 py-3 text-sm text-right text-red-600">({fmt(invResult.operating_expenses)})</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="px-5 py-3 text-sm font-bold text-blue-800">Net Operating Income</td>
                      <td className="px-5 py-3 text-sm font-bold text-right text-blue-800">{fmt(invResult.net_operating_income)}</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-slate-600">Capitalisation Rate</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-600">{fmtPct(invResult.cap_rate ?? invForm.cap_rate)}</td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="px-5 py-3 text-base font-bold text-green-800">Indicated Value</td>
                      <td className="px-5 py-3 text-xl font-bold text-right text-green-700">{fmt(invResult.indicated_value)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── COST APPROACH ── */}
      {activeTab === 'cost' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-1">Depreciated Replacement Cost Approach</h2>
            <p className="text-xs text-slate-500 mb-4">Value based on land value plus depreciated cost of improvements</p>
            <form onSubmit={calcCost} className="space-y-4">
              <div>
                <label className={labelCls}>Property (optional)</label>
                <select className={inputCls} value={costForm.property_id}
                  onChange={e => setCostForm(f => ({ ...f, property_id: e.target.value }))}>
                  <option value="">No property selected</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name ?? p.address}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Land Value (USD)</label>
                  <input type="number" className={inputCls} value={costForm.land_value}
                    onChange={e => setCostForm(f => ({ ...f, land_value: e.target.value }))}
                    placeholder="e.g. 50000" min={0} required />
                </div>
                <div>
                  <label className={labelCls}>Current Replacement Cost of Improvements (USD)</label>
                  <input type="number" className={inputCls} value={costForm.replacement_cost}
                    onChange={e => setCostForm(f => ({ ...f, replacement_cost: e.target.value }))}
                    placeholder="e.g. 150000" min={0} required />
                </div>
                <div>
                  <label className={labelCls}>Age of Improvements (years)</label>
                  <input type="number" className={inputCls} value={costForm.age_years}
                    onChange={e => setCostForm(f => ({ ...f, age_years: e.target.value }))}
                    placeholder="e.g. 15" min={0} required />
                </div>
                <div>
                  <label className={labelCls}>Economic Life (years)</label>
                  <input type="number" className={inputCls} value={costForm.economic_life}
                    onChange={e => setCostForm(f => ({ ...f, economic_life: e.target.value }))}
                    placeholder="50" min={1} />
                </div>
                <div>
                  <label className={labelCls}>Functional Obsolescence %</label>
                  <input type="number" className={inputCls} value={costForm.functional_obsolescence_pct}
                    onChange={e => setCostForm(f => ({ ...f, functional_obsolescence_pct: e.target.value }))}
                    placeholder="0" min={0} max={100} step={0.5} />
                </div>
                <div>
                  <label className={labelCls}>External Obsolescence %</label>
                  <input type="number" className={inputCls} value={costForm.external_obsolescence_pct}
                    onChange={e => setCostForm(f => ({ ...f, external_obsolescence_pct: e.target.value }))}
                    placeholder="0" min={0} max={100} step={0.5} />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={costLoading}
                  className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {costLoading ? 'Calculating...' : 'Calculate'}
                </button>
              </div>
            </form>
          </div>

          {costResult && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Cost Approach Results</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Component</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-5 py-3 text-sm text-slate-700">Land Value</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-700">{fmt(costResult.land_value)}</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-slate-700">Replacement Cost of Improvements</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-700">{fmt(costResult.replacement_cost)}</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-red-600">
                        Less: Physical Depreciation ({fmtPct(costResult.physical_depreciation_pct)})
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-red-600">({fmt(costResult.physical_depreciation)})</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-red-600">Less: Functional Obsolescence</td>
                      <td className="px-5 py-3 text-sm text-right text-red-600">({fmt(costResult.functional_obsolescence)})</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-red-600">Less: External Obsolescence</td>
                      <td className="px-5 py-3 text-sm text-right text-red-600">({fmt(costResult.external_obsolescence)})</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">Depreciated Value of Improvements</td>
                      <td className="px-5 py-3 text-sm font-semibold text-right text-slate-800">{fmt(costResult.depreciated_improvements_value)}</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-slate-700">Plus: Land Value</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-700">{fmt(costResult.land_value)}</td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="px-5 py-3 text-base font-bold text-green-800">Total Property Value</td>
                      <td className="px-5 py-3 text-xl font-bold text-right text-green-700">{fmt(costResult.total_property_value)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── REPORT GENERATOR ── */}
      {activeTab === 'report' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Generate Valuation Report</h2>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Valuation</label>
                <select className={inputCls} value={selectedValuation}
                  onChange={e => setSelectedValuation(e.target.value)}>
                  <option value="">Select a valuation...</option>
                  {valuations.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.property_name ?? v.property ?? `Valuation #${v.id}`} — {v.valuation_date ? new Date(v.valuation_date).toLocaleDateString() : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Purpose of Valuation</label>
                <select className={inputCls} value={reportPurpose}
                  onChange={e => setReportPurpose(e.target.value)}>
                  <option value="">Select purpose...</option>
                  {['Mortgage Security', 'Insurance', 'Open Market Sale', 'Deceased Estate', 'Rental Determination', 'Asset Register', 'Stamp Duty', 'Expropriation'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end">
                <button onClick={generateReport} disabled={reportLoading}
                  className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {reportLoading ? 'Generating...' : 'Generate Report'}
                </button>
              </div>
            </div>
          </div>

          {reportText && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Generated Valuation Report</h3>
                <div className="flex gap-2">
                  <button onClick={copyReport}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200">
                    <Copy size={13} />
                    Copy to Clipboard
                  </button>
                  <button onClick={printReport}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-white text-xs font-medium rounded-lg hover:bg-slate-800">
                    <Printer size={13} />
                    Print
                  </button>
                </div>
              </div>
              <div className="p-5">
                <pre className="font-mono text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-xl p-5 max-h-[60vh] overflow-y-auto leading-relaxed">
                  {reportText}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Comparable Modal */}
      {addModal && (
        <Modal open={true} onClose={() => setAddModal(false)} title="Add Sales Comparable" size="lg">
          <form onSubmit={handleAddComparable} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Address</label>
                <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Full property address" required />
              </div>
              <div>
                <label className={labelCls}>Suburb</label>
                <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.suburb} onChange={e => setAddForm(f => ({ ...f, suburb: e.target.value }))} placeholder="e.g. Borrowdale" />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Harare" />
              </div>
              <div>
                <label className={labelCls}>Property Type</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.property_type} onChange={e => setAddForm(f => ({ ...f, property_type: e.target.value }))} required>
                  <option value="">Select type...</option>
                  {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Land Size (m²)</label>
                <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.land_size_sqm} onChange={e => setAddForm(f => ({ ...f, land_size_sqm: e.target.value }))} min={0} />
              </div>
              <div>
                <label className={labelCls}>Floor Size (m²)</label>
                <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.floor_area_sqm} onChange={e => setAddForm(f => ({ ...f, floor_area_sqm: e.target.value }))} min={0} />
              </div>
              <div>
                <label className={labelCls}>Bedrooms</label>
                <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.bedrooms} onChange={e => setAddForm(f => ({ ...f, bedrooms: e.target.value }))} min={0} />
              </div>
              <div>
                <label className={labelCls}>Bathrooms</label>
                <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.bathrooms} onChange={e => setAddForm(f => ({ ...f, bathrooms: e.target.value }))} min={0} />
              </div>
              <div>
                <label className={labelCls}>Sale Price (USD)</label>
                <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.sale_price_usd} onChange={e => setAddForm(f => ({ ...f, sale_price_usd: e.target.value }))} min={0} required />
              </div>
              <div>
                <label className={labelCls}>Sale Date</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.sale_date} onChange={e => setAddForm(f => ({ ...f, sale_date: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Source</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.source} onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))} required>
                  <option value="">Select source...</option>
                  {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Notes</label>
                <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2} value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes..." />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="comp_verified" checked={addForm.verified}
                  onChange={e => setAddForm(f => ({ ...f, verified: e.target.checked }))} className="rounded" />
                <label htmlFor="comp_verified" className="text-sm font-medium text-slate-700">Verified from official source</label>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setAddModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={adding}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {adding ? 'Adding...' : 'Add Comparable'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
