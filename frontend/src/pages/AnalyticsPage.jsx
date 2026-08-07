import { useState, useEffect } from 'react'
import { propertiesAPI } from '../services/api'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { TrendingUp, DollarSign, BarChart2, Users, ArrowUp, ArrowDown } from 'lucide-react'

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16']

function KpiCard({ icon: Icon, label, value, color = 'blue', delta, deltaLabel }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600' },
    green:  { bg: 'bg-green-50',  text: 'text-green-600' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-600' },
    red:    { bg: 'bg-red-50',    text: 'text-red-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  }
  const c = colorMap[color] || colorMap.blue
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon size={18} className={c.text} />
        </div>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="text-3xl font-bold text-slate-800">{value ?? '—'}</p>
      {delta !== undefined && (
        <p className={`flex items-center gap-1 text-xs mt-2 ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {delta >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {Math.abs(delta)}% {deltaLabel || 'vs last month'}
        </p>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-800 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Skeleton({ h = 'h-64' }) {
  return <div className={`animate-pulse bg-slate-100 rounded-lg ${h}`} />
}

const fmtCurrency = (v) =>
  v != null ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
const fmtPct = (v) => v != null ? `${v}%` : '—'

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState([])
  const [selectedProp, setSelectedProp] = useState(null)
  const [roiData, setRoiData] = useState(null)
  const [roiLoading, setRoiLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [analyticsRes, propRes] = await Promise.all([
          propertiesAPI.portfolioAnalytics(),
          propertiesAPI.list(),
        ])
        setData(analyticsRes.data)
        const props = propRes.data.results || propRes.data
        setProperties(props)
        if (props.length > 0) setSelectedProp(props[0].id)
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedProp) return
    setRoiLoading(true)
    propertiesAPI.roiAnalytics(selectedProp)
      .then(({ data }) => setRoiData(data))
      .catch(() => setRoiData(null))
      .finally(() => setRoiLoading(false))
  }, [selectedProp])

  const monthlyData = data?.monthly_data || []
  const byType = data?.by_type?.map((t, i) => ({
    name: t.property_type.replace(/_/g, ' '),
    value: t.count,
    color: COLORS[i % COLORS.length],
  })) || []

  const totalRevenue = monthlyData.reduce((s, d) => s + (d.revenue || 0), 0)
  const totalExpenses = monthlyData.reduce((s, d) => s + (d.expenses || 0), 0)
  const totalNOI = totalRevenue - totalExpenses

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analytics & Reports</h1>
        <p className="text-slate-500 text-sm mt-1">Portfolio performance for {data?.year || new Date().getFullYear()}</p>
      </div>

      {/* KPI Row */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} h="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={TrendingUp} label="Annual Revenue" color="green"
            value={fmtCurrency(totalRevenue)} />
          <KpiCard icon={DollarSign} label="Annual Expenses" color="amber"
            value={fmtCurrency(totalExpenses)} />
          <KpiCard icon={BarChart2} label="Net Operating Income" color="blue"
            value={fmtCurrency(totalNOI)} />
          <KpiCard icon={Users} label="Occupancy Rate" color={data?.occupancy_rate >= 80 ? 'green' : 'amber'}
            value={fmtPct(data?.occupancy_rate)}
            deltaLabel={`${data?.occupied_units}/${data?.total_units} units`} />
        </div>
      )}

      {/* Revenue vs Expenses */}
      <Section title="Monthly Revenue vs Expenses vs NOI">
        {loading ? <Skeleton /> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
              <Tooltip formatter={(v, n) => [`$${v.toLocaleString()}`, { revenue: 'Revenue', expenses: 'Expenses', noi: 'NOI' }[n]]} />
              <Legend />
              <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#rev)" strokeWidth={2} name="revenue" />
              <Area type="monotone" dataKey="expenses" stroke="#f59e0b" fill="url(#exp)" strokeWidth={2} name="expenses" />
              <Line type="monotone" dataKey="noi" stroke="#10b981" strokeWidth={2} dot={false} name="noi" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Portfolio mix + occupancy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Portfolio by Property Type">
          {loading ? <Skeleton h="h-52" /> : byType.length === 0 ? (
            <p className="text-slate-400 text-sm">No data</p>
          ) : (
            <div className="flex gap-6 items-center">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3}>
                    {byType.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {byType.map((t, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="text-sm capitalize text-slate-700">{t.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="Occupancy">
          {loading ? <Skeleton h="h-52" /> : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-bold text-slate-800">{fmtPct(data?.occupancy_rate)}</p>
                  <p className="text-sm text-slate-500 mt-1">occupancy rate</p>
                </div>
                <div className="text-right space-y-1">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{data?.occupied_units ?? '—'}</p>
                    <p className="text-xs text-slate-500">occupied</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-amber-500">{data?.vacant_units ?? '—'}</p>
                    <p className="text-xs text-slate-500">vacant</p>
                  </div>
                </div>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-700"
                  style={{ width: `${data?.occupancy_rate || 0}%` }} />
              </div>
              <p className="text-xs text-slate-400">{data?.total_units ?? '—'} total units</p>
            </div>
          )}
        </Section>
      </div>

      {/* Property ROI */}
      <Section title="Property ROI Calculator">
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Property</label>
          <select value={selectedProp || ''} onChange={e => setSelectedProp(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-64">
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {roiLoading ? <Skeleton h="h-32" /> : roiData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Annual Revenue', value: fmtCurrency(roiData.annual_revenue), color: 'text-green-600' },
              { label: 'Annual Expenses', value: fmtCurrency(roiData.annual_expenses), color: 'text-amber-600' },
              { label: 'Net Operating Income', value: fmtCurrency(roiData.noi), color: roiData.noi >= 0 ? 'text-blue-600' : 'text-red-600' },
              { label: 'Property Value', value: fmtCurrency(roiData.property_value), color: 'text-slate-800' },
              { label: 'ROI / Cap Rate', value: `${roiData.roi}%`, color: roiData.roi >= 5 ? 'text-green-600' : 'text-amber-600' },
              { label: 'Gross Yield', value: `${roiData.gross_yield}%`, color: 'text-purple-600' },
              { label: 'Monthly Rent', value: fmtCurrency(roiData.monthly_rent), color: 'text-slate-700' },
              { label: 'Annual Rent Income', value: fmtCurrency(roiData.monthly_rent * 12), color: 'text-slate-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-sm">Select a property to view ROI analytics</p>
        )}
      </Section>
    </div>
  )
}
