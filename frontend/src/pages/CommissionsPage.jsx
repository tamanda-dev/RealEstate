import { useState } from 'react'
import { DollarSign, Percent, TrendingUp, AlertCircle, Download, BarChart2 } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import StatCard from '../components/StatCard'
import Table from '../components/Table'
import { useToast } from '../context/ToastContext'
import { reportsAPI } from '../services/api'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1'

export default function CommissionsPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('trends')

  // ── COMMISSION TRENDS ──
  const [trendsYear, setTrendsYear] = useState(currentYear)
  const [trendsData, setTrendsData] = useState(null)
  const [trendsLoading, setTrendsLoading] = useState(false)

  const loadTrends = async () => {
    setTrendsLoading(true)
    try {
      const res = await reportsAPI.commissionTrends(trendsYear)
      setTrendsData(res.data)
    } catch {
      toast.toast('Failed to load commission trends', 'error')
    } finally {
      setTrendsLoading(false)
    }
  }

  const trendsMonthly = trendsData?.monthly ?? []
  const trendsChartData = MONTHS.map((m, i) => {
    const row = trendsMonthly.find(d => d.month === i + 1) ?? {}
    return {
      month: m,
      rental_commission: Number(row.rental_commission ?? 0),
      net_rental_commission: Number(row.net_rental_commission ?? 0),
    }
  })

  let runningTotal = 0
  const trendsTableData = trendsMonthly.map(row => {
    runningTotal += Number(row.rental_commission ?? 0)
    return { ...row, running_total: runningTotal }
  })

  const trendsColumns = [
    { key: 'month', label: 'Month', render: v => MONTHS[(v ?? 1) - 1] },
    { key: 'rental_commission', label: 'Rental Commission', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'vat_on_rental', label: 'VAT', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'net_rental_commission', label: 'Net Rental', render: v => <span className="font-semibold text-green-700">${Number(v ?? 0).toLocaleString()}</span> },
    { key: 'running_total', label: 'Running Total', render: v => <span className="font-semibold text-blue-700">${Number(v ?? 0).toLocaleString()}</span> },
  ]

  // ── VAT REPORT ──
  const [vatYear, setVatYear] = useState(currentYear)
  const [vatMonth, setVatMonth] = useState('')
  const [vatData, setVatData] = useState(null)
  const [vatLoading, setVatLoading] = useState(false)

  const loadVat = async () => {
    setVatLoading(true)
    try {
      const params = { year: vatYear }
      if (vatMonth) params.month = vatMonth
      const res = await reportsAPI.vatZimra(params)
      setVatData(res.data)
    } catch {
      toast.toast('Failed to load VAT report', 'error')
    } finally {
      setVatLoading(false)
    }
  }

  const vatMonthly = vatData?.monthly ?? []
  const vatColumns = [
    { key: 'month', label: 'Month', render: v => MONTHS[(v ?? 1) - 1] },
    { key: 'commission', label: 'Commission', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'vat_due', label: 'VAT Due', render: v => <span className="font-bold text-red-600">${Number(v ?? 0).toLocaleString()}</span> },
  ]

  const exportZimra = () => {
    if (!vatData) return
    const lines = [
      `ZIMRA VAT REPORT - ${vatYear}${vatMonth ? ` Month ${vatMonth}` : ''}`,
      `Generated: ${new Date().toLocaleDateString()}`,
      ``,
      `Total Gross Rent Managed: $${Number(vatData.total_gross_rent ?? 0).toLocaleString()}`,
      `Total Commissions Earned: $${Number(vatData.total_commissions ?? 0).toLocaleString()}`,
      `VAT Due (15%): $${Number(vatData.vat_due ?? 0).toLocaleString()}`,
      ``,
      `MONTHLY BREAKDOWN:`,
      ...vatMonthly.map(row =>
        `${MONTHS[(row.month ?? 1) - 1]}: Commission $${Number(row.commission ?? 0).toLocaleString()} | VAT Due $${Number(row.vat_due ?? 0).toLocaleString()}`
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ZIMRA_VAT_${vatYear}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── MARKET PRICE ANALYSIS ──
  const [marketData, setMarketData] = useState([])
  const [marketLoading, setMarketLoading] = useState(false)

  const loadMarket = async () => {
    setMarketLoading(true)
    try {
      const res = await reportsAPI.marketPriceAnalysis()
      setMarketData(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast.toast('Failed to load market analysis', 'error')
    } finally {
      setMarketLoading(false)
    }
  }

  const rowClass = (row) => {
    const pct = Number(row.pct_vs_market ?? 0)
    if (pct > 10) return 'bg-red-50'
    if (pct < -10) return 'bg-blue-50'
    return 'bg-green-50'
  }

  const priceLabel = (pct) => {
    const n = Number(pct ?? 0)
    if (n > 10) return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Overpriced</span>
    if (n < -10) return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">Below Market / Good Deal</span>
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">At Market</span>
  }

  const marketColumns = [
    { key: 'property_name', label: 'Property', render: v => <span className="font-medium">{v}</span> },
    { key: 'city', label: 'City' },
    { key: 'property_type', label: 'Type' },
    { key: 'asking_price', label: 'Asking Price', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'market_average', label: 'Market Average', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'pct_vs_market', label: '% vs Market', render: v => {
      const n = Number(v ?? 0)
      return <span className={`font-semibold ${n > 0 ? 'text-red-600' : n < 0 ? 'text-blue-600' : 'text-green-600'}`}>
        {n > 0 ? '+' : ''}{n.toFixed(1)}%
      </span>
    }},
    { key: 'pct_vs_market', label: 'Assessment', render: v => priceLabel(v) },
  ]

  const aboveMarket = marketData.filter(r => Number(r.pct_vs_market ?? 0) > 10).length
  const atMarket = marketData.filter(r => Math.abs(Number(r.pct_vs_market ?? 0)) <= 10).length
  const belowMarket = marketData.filter(r => Number(r.pct_vs_market ?? 0) < -10).length

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Commissions & VAT (ZIMRA)</h1>
        <p className="text-sm text-slate-500 mt-0.5">Commission trends, VAT compliance and market price analysis</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {[
          { key: 'trends', label: 'Commission Trends' },
          { key: 'vat', label: 'VAT Report' },
          { key: 'market', label: 'Market Price Analysis' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── COMMISSION TRENDS ── */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className={labelCls}>Year</label>
                <select className={inputCls} value={trendsYear} onChange={e => setTrendsYear(Number(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={loadTrends} disabled={trendsLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {trendsLoading ? 'Loading...' : 'Load'}
              </button>
            </div>
          </div>

          {trendsData && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard icon={DollarSign} label="Rental Commission (Gross)" value={`$${Number(trendsData.rental_commission_gross ?? 0).toLocaleString()}`} color="blue" />
                <StatCard icon={Percent} label="VAT on Rental" value={`$${Number(trendsData.vat_on_rental ?? 0).toLocaleString()}`} color="orange" />
                <StatCard icon={TrendingUp} label="Net Rental Commission" value={`$${Number(trendsData.net_rental_commission ?? 0).toLocaleString()}`} color="green" />
                <StatCard icon={DollarSign} label="Sales Commission" value={`$${Number(trendsData.sales_commission ?? 0).toLocaleString()}`} color="purple" />
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                  <span className="text-blue-100 text-xs font-semibold">Total Commission Income</span>
                  <span className="text-white text-2xl font-bold">${Number(trendsData.total_commission_income ?? 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-800 mb-4">Monthly Commission Trends ({trendsYear})</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trendsChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                    <Tooltip formatter={v => `$${Number(v).toLocaleString()}`} />
                    <Legend />
                    <Area type="monotone" dataKey="rental_commission" name="Rental Commission" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} />
                    <Area type="monotone" dataKey="net_rental_commission" name="Net Rental Commission" stroke="#22c55e" fill="#dcfce7" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Monthly Detail</h2>
                </div>
                <Table columns={trendsColumns} data={trendsTableData} loading={false} emptyMessage="No monthly data" />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── VAT REPORT ── */}
      {activeTab === 'vat' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className={labelCls}>Year</label>
                <select className={inputCls} value={vatYear} onChange={e => setVatYear(Number(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Month (optional)</label>
                <select className={inputCls} value={vatMonth} onChange={e => setVatMonth(e.target.value)}>
                  <option value="">All Months</option>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <button onClick={loadVat} disabled={vatLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {vatLoading ? 'Loading...' : 'Load VAT Report'}
              </button>
            </div>
          </div>

          {vatData && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard icon={DollarSign} label="Total Gross Rent Managed" value={`$${Number(vatData.total_gross_rent ?? 0).toLocaleString()}`} color="blue" />
                <StatCard icon={BarChart2} label="Total Commissions Earned" value={`$${Number(vatData.total_commissions ?? 0).toLocaleString()}`} color="orange" />
                <div className="bg-red-600 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                  <span className="text-red-100 text-xs font-semibold">VAT Due (15%)</span>
                  <span className="text-white text-2xl font-bold">${Number(vatData.vat_due ?? 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Info box */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertCircle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  VAT on commission income is due to ZIMRA by the 25th of the following month. Ensure timely submission to avoid penalties.
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">Monthly VAT Breakdown</h2>
                  <button onClick={exportZimra}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800">
                    <Download size={14} />
                    Export for ZIMRA
                  </button>
                </div>
                <Table columns={vatColumns} data={vatMonthly} loading={false} emptyMessage="No VAT data" />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MARKET PRICE ANALYSIS ── */}
      {activeTab === 'market' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-center gap-4">
              <p className="text-sm text-slate-600">Analyse your property portfolio against current market comparables.</p>
              <button onClick={loadMarket} disabled={marketLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
                {marketLoading ? 'Analysing...' : 'Analyse Now'}
              </button>
            </div>
          </div>

          {marketData.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-red-600">Above Market</p>
                  <p className="text-2xl font-bold text-red-700">{aboveMarket}</p>
                  <p className="text-xs text-red-500">listings &gt;10% above avg</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-green-600">At Market</p>
                  <p className="text-2xl font-bold text-green-700">{atMarket}</p>
                  <p className="text-xs text-green-500">listings within ±10%</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-blue-600">Below Market / Good Deal</p>
                  <p className="text-2xl font-bold text-blue-700">{belowMarket}</p>
                  <p className="text-xs text-blue-500">listings &gt;10% below avg</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Market Price Analysis</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Red = Overpriced (&gt;10% above market) | Green = At Market (±10%) | Blue = Below Market / Good Deal (&gt;10% below)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {marketColumns.map((col, i) => (
                          <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {marketData.map((row, ri) => (
                        <tr key={ri} className={`border-b border-slate-100 transition-colors ${rowClass(row)}`}>
                          {marketColumns.map((col, ci) => (
                            <td key={ci} className="px-4 py-3 text-sm text-slate-700">
                              {col.render ? col.render(row[col.key], row) : row[col.key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
