import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Table from '../components/Table'
import { reportsAPI } from '../services/api'
import { useToast } from '../context/ToastContext'
import {
  TrendingDown, TrendingUp, DollarSign, PieChart as PieIcon,
  BarChart2, Users, Droplets, Package, Filter
} from 'lucide-react'

const TABS = ['Aging Report', 'P&L Report', 'Agent Performance', 'Cash Flow Forecast', 'Inventory']

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

function fmt(n, decimals = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function pct(n) {
  if (n == null) return '—'
  return `${Number(n).toFixed(1)}%`
}

export default function ReportsPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('Aging Report')

  // Aging
  const [aging, setAging] = useState(null)
  const [agingLoading, setAgingLoading] = useState(false)
  const [agingProperty, setAgingProperty] = useState('')

  // P&L
  const [pl, setPl] = useState(null)
  const [plLoading, setPlLoading] = useState(false)
  const [plYear, setPlYear] = useState(new Date().getFullYear())
  const [plMonth, setPlMonth] = useState('')
  const [plProperty, setPlProperty] = useState('')

  // Agent Performance
  const [agentPerf, setAgentPerf] = useState([])
  const [agentPerfLoading, setAgentPerfLoading] = useState(false)

  // Cash Flow
  const [cashFlow, setCashFlow] = useState(null)
  const [cashFlowLoading, setCashFlowLoading] = useState(false)

  // Inventory
  const [inventory, setInventory] = useState(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)

  const loadAging = useCallback(async () => {
    setAgingLoading(true)
    try {
      const params = {}
      if (agingProperty) params.property = agingProperty
      const { data } = await reportsAPI.aging(params)
      setAging(data)
    } catch {
      toast('Failed to load aging report', 'error')
    } finally {
      setAgingLoading(false)
    }
  }, [agingProperty, toast])

  const loadPl = useCallback(async () => {
    setPlLoading(true)
    try {
      const params = { year: plYear }
      if (plMonth) params.month = plMonth
      if (plProperty) params.property = plProperty
      const { data } = await reportsAPI.pl(params)
      setPl(data)
    } catch {
      toast('Failed to load P&L report', 'error')
    } finally {
      setPlLoading(false)
    }
  }, [plYear, plMonth, plProperty, toast])

  const loadAgentPerf = useCallback(async () => {
    setAgentPerfLoading(true)
    try {
      const { data } = await reportsAPI.agentPerformance()
      const arr = data?.results ?? data ?? []
      setAgentPerf([...arr].sort((a, b) => (b.conversion_rate ?? 0) - (a.conversion_rate ?? 0)))
    } catch {
      toast('Failed to load agent performance', 'error')
    } finally {
      setAgentPerfLoading(false)
    }
  }, [toast])

  const loadCashFlow = useCallback(async () => {
    setCashFlowLoading(true)
    try {
      const { data } = await reportsAPI.cashFlow()
      setCashFlow(data)
    } catch {
      toast('Failed to load cash flow forecast', 'error')
    } finally {
      setCashFlowLoading(false)
    }
  }, [toast])

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true)
    try {
      const { data } = await reportsAPI.inventory()
      setInventory(data)
    } catch {
      toast('Failed to load inventory report', 'error')
    } finally {
      setInventoryLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (activeTab === 'Aging Report') loadAging()
    if (activeTab === 'P&L Report') loadPl()
    if (activeTab === 'Agent Performance') loadAgentPerf()
    if (activeTab === 'Cash Flow Forecast') loadCashFlow()
    if (activeTab === 'Inventory') loadInventory()
  }, [activeTab, loadAging, loadPl, loadAgentPerf, loadCashFlow, loadInventory])

  const agentColumns = [
    { key: 'agent_name', label: 'Agent', render: (v, row) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
          {(v ?? '?')[0].toUpperCase()}
        </div>
        <span className="text-sm font-medium text-slate-800">{v ?? '—'}</span>
      </div>
    )},
    { key: 'total_leads', label: 'Leads', render: (v) => <span className="text-sm">{v ?? 0}</span> },
    { key: 'won', label: 'Won', render: (v) => <span className="text-sm text-green-700 font-medium">{v ?? 0}</span> },
    { key: 'lost', label: 'Lost', render: (v) => <span className="text-sm text-red-600">{v ?? 0}</span> },
    { key: 'conversion_rate', label: 'Conversion', render: (v) => (
      <div className="flex items-center gap-2">
        <div className="w-16 bg-slate-100 rounded-full h-1.5">
          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(v ?? 0, 100)}%` }} />
        </div>
        <span className="text-sm font-medium">{pct(v)}</span>
      </div>
    )},
    { key: 'pipeline_value', label: 'Pipeline Value', render: (v) => (
      <span className="text-sm font-medium text-slate-700">${fmt(v)}</span>
    )},
  ]

  const inventoryColumns = [
    { key: 'property_name', label: 'Property', render: (v) => <span className="font-medium text-slate-800 text-sm">{v}</span> },
    { key: 'property_type', label: 'Type', render: (v) => <Badge value={v} /> },
    { key: 'total_units', label: 'Units', render: (v) => <span className="text-sm">{v}</span> },
    { key: 'occupied', label: 'Occupied', render: (v) => <span className="text-sm text-green-700">{v}</span> },
    { key: 'vacant', label: 'Vacant', render: (v) => <span className="text-sm text-amber-600">{v}</span> },
    { key: 'occupancy_rate', label: 'Occupancy %', render: (v) => (
      <div className="flex items-center gap-2">
        <div className="w-16 bg-slate-100 rounded-full h-1.5">
          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(v ?? 0, 100)}%` }} />
        </div>
        <span className="text-sm font-medium">{pct(v)}</span>
      </div>
    )},
    { key: 'monthly_rent', label: 'Monthly Rent (USD)', render: (v) => <span className="text-sm font-medium">${fmt(v)}</span> },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reports & Analytics</h1>
        <p className="text-slate-500 text-sm mt-0.5">Financial and operational performance reports</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Aging Report */}
      {activeTab === 'Aging Report' && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <input value={agingProperty} onChange={e => setAgingProperty(e.target.value)}
              placeholder="Filter by property..." className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
            <button onClick={loadAging} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white hover:bg-slate-50">
              <Filter size={14} /> Apply
            </button>
          </div>
          {agingLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : aging ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { label: 'Current', value: aging.buckets?.current ?? 0, color: 'green' },
                  { label: '1–30 Days', value: aging.buckets?.['1_30'] ?? 0, color: 'yellow' },
                  { label: '31–60 Days', value: aging.buckets?.['31_60'] ?? 0, color: 'orange' },
                  { label: '61–90 Days', value: aging.buckets?.['61_90'] ?? 0, color: 'red' },
                  { label: '90+ Days', value: aging.buckets?.['90_plus'] ?? 0, color: 'red' },
                ].map(({ label, value, color }) => (
                  <StatCard key={label} icon={DollarSign} label={label} value={`$${fmt(value)}`} color={color} />
                ))}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-700">Overdue Invoice Details</h3>
                </div>
                <Table
                  columns={[
                    { key: 'invoice_number', label: 'Invoice', render: v => <span className="font-mono text-sm text-blue-600">{v}</span> },
                    { key: 'tenant_name', label: 'Tenant', render: v => <span className="text-sm">{v}</span> },
                    { key: 'property_name', label: 'Property', render: v => <span className="text-sm">{v}</span> },
                    { key: 'days_overdue', label: 'Days Overdue', render: v => (
                      <span className={`text-sm font-medium ${v > 60 ? 'text-red-600' : v > 30 ? 'text-amber-600' : 'text-slate-600'}`}>{v}</span>
                    )},
                    { key: 'balance', label: 'Balance (USD)', render: v => <span className="text-sm font-semibold text-red-600">${fmt(v, 2)}</span> },
                  ]}
                  data={aging.invoices ?? []}
                  loading={false}
                  emptyMessage="No overdue invoices"
                />
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-slate-400">No aging data</div>
          )}
        </div>
      )}

      {/* P&L Report */}
      {activeTab === 'P&L Report' && (
        <div className="space-y-6">
          <div className="flex gap-3 flex-wrap">
            <select value={plYear} onChange={e => setPlYear(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={plMonth} onChange={e => setPlMonth(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Full Year</option>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <input value={plProperty} onChange={e => setPlProperty(e.target.value)}
              placeholder="Property..." className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
            <button onClick={loadPl} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Filter size={14} /> Load
            </button>
          </div>
          {plLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : pl ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard icon={TrendingUp} label="Revenue" value={`$${fmt(pl.total_revenue)}`} color="green" />
                <StatCard icon={TrendingDown} label="Expenses" value={`$${fmt(pl.total_expenses)}`} color="red" />
                <StatCard icon={DollarSign} label="NOI" value={`$${fmt(pl.noi)}`} color="blue" />
                <StatCard icon={PieIcon} label="Profit Margin" value={pct(pl.profit_margin)} color="indigo" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-semibold text-slate-700 mb-4">Revenue vs Expenses</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={pl.monthly_data ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => `$${fmt(v, 2)}`} />
                      <Legend />
                      <Bar dataKey="revenue" fill="#3b82f6" radius={[3,3,0,0]} name="Revenue" />
                      <Bar dataKey="expenses" fill="#ef4444" radius={[3,3,0,0]} name="Expenses" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {pl.expense_breakdown?.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h3 className="font-semibold text-slate-700 mb-4">Expense Breakdown</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={pl.expense_breakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {pl.expense_breakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => `$${fmt(v, 2)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-slate-400">Select filters and click Load to view P&L</div>
          )}
        </div>
      )}

      {/* Agent Performance */}
      {activeTab === 'Agent Performance' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Users size={16} className="text-slate-400" />
              <h3 className="font-semibold text-slate-700">Agent Performance — sorted by conversion rate</h3>
            </div>
            <Table columns={agentColumns} data={agentPerf} loading={agentPerfLoading} emptyMessage="No agent performance data" />
          </div>
        </div>
      )}

      {/* Cash Flow Forecast */}
      {activeTab === 'Cash Flow Forecast' && (
        <div className="space-y-6">
          {cashFlowLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : cashFlow ? (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-700 mb-4">12-Month Projected Cash Flow</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={cashFlow.monthly ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `$${fmt(v, 2)}`} />
                    <Legend />
                    <Line type="monotone" dataKey="income" stroke="#3b82f6" strokeWidth={2} dot={false} name="Income" />
                    <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} name="Expenses" />
                    <Line type="monotone" dataKey="noi" stroke="#10b981" strokeWidth={2} dot={false} name="NOI" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <Table
                  columns={[
                    { key: 'month', label: 'Month', render: v => <span className="text-sm font-medium">{v}</span> },
                    { key: 'income', label: 'Income (USD)', render: v => <span className="text-sm text-green-700">${fmt(v)}</span> },
                    { key: 'expenses', label: 'Expenses (USD)', render: v => <span className="text-sm text-red-600">${fmt(v)}</span> },
                    { key: 'noi', label: 'NOI (USD)', render: v => <span className={`text-sm font-semibold ${v >= 0 ? 'text-blue-700' : 'text-red-700'}`}>${fmt(v)}</span> },
                  ]}
                  data={cashFlow.monthly ?? []}
                  loading={false}
                  emptyMessage="No cash flow data"
                />
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-slate-400">No cash flow data available</div>
          )}
        </div>
      )}

      {/* Inventory */}
      {activeTab === 'Inventory' && (
        <div className="space-y-4">
          {inventoryLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : inventory ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard icon={Package} label="Total Properties" value={inventory.summary?.total_properties ?? 0} color="blue" />
                <StatCard icon={Package} label="Total Units" value={inventory.summary?.total_units ?? 0} color="indigo" />
                <StatCard icon={TrendingUp} label="Occupied" value={inventory.summary?.occupied ?? 0} color="green" />
                <StatCard icon={Droplets} label="Vacant" value={inventory.summary?.vacant ?? 0} color="yellow" />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <Table
                  columns={inventoryColumns}
                  data={inventory.properties ?? []}
                  loading={false}
                  emptyMessage="No inventory data"
                />
                {inventory.summary && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center gap-8 text-sm">
                    <span className="font-bold text-slate-700">TOTALS</span>
                    <span>Units: <strong>{inventory.summary.total_units ?? 0}</strong></span>
                    <span className="text-green-700">Occupied: <strong>{inventory.summary.occupied ?? 0}</strong></span>
                    <span className="text-amber-600">Vacant: <strong>{inventory.summary.vacant ?? 0}</strong></span>
                    <span>Avg Occupancy: <strong>{pct(inventory.summary.avg_occupancy)}</strong></span>
                    <span>Total Rent: <strong>${fmt(inventory.summary.total_monthly_rent)}/mo</strong></span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-slate-400">No inventory data available</div>
          )}
        </div>
      )}
    </div>
  )
}
