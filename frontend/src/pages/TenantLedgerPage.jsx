import { useState, useEffect } from 'react'
import { ArrowDownCircle, ArrowUpCircle, DollarSign, Users, TrendingDown, Building2 } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Table from '../components/Table'
import { useToast } from '../context/ToastContext'
import { reportsAPI, usersAPI } from '../services/api'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1'

export default function TenantLedgerPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('tenant')

  // ── TENANT LEDGER ──
  const [tenants, setTenants] = useState([])
  const [selectedTenant, setSelectedTenant] = useState('')
  const [tenantLedger, setTenantLedger] = useState(null)
  const [tenantLoading, setTenantLoading] = useState(false)

  useEffect(() => {
    usersAPI.tenants().then(r => {
      setTenants(Array.isArray(r.data) ? r.data : r.data?.results ?? [])
    }).catch(() => {})
  }, [])

  const loadTenantLedger = async () => {
    if (!selectedTenant) { toast.toast('Select a tenant first', 'warning'); return }
    setTenantLoading(true)
    try {
      const res = await reportsAPI.tenantLedger(selectedTenant)
      setTenantLedger(res.data)
    } catch {
      toast.toast('Failed to load tenant ledger', 'error')
    } finally {
      setTenantLoading(false)
    }
  }

  const ledgerEntries = tenantLedger?.entries ?? tenantLedger?.ledger ?? []

  const tenantLedgerColumns = [
    {
      key: 'date', label: 'Date',
      render: v => v ? new Date(v).toLocaleDateString() : '-'
    },
    {
      key: 'type', label: 'Type',
      render: (v) => {
        const isInvoice = v?.toLowerCase().includes('invoice') || v === 'debit'
        return (
          <div className="flex items-center gap-1.5">
            {isInvoice
              ? <ArrowDownCircle size={15} className="text-red-500" />
              : <ArrowUpCircle size={15} className="text-green-500" />
            }
            <span className={`text-xs font-medium ${isInvoice ? 'text-red-600' : 'text-green-600'}`}>{v}</span>
          </div>
        )
      }
    },
    { key: 'description', label: 'Description', render: v => <span className="text-slate-600 text-sm">{v}</span> },
    {
      key: 'debit', label: 'Debit',
      render: v => v ? <span className="text-red-600 font-medium">${Number(v).toLocaleString()}</span> : <span className="text-slate-300">—</span>
    },
    {
      key: 'credit', label: 'Credit',
      render: v => v ? <span className="text-green-600 font-medium">${Number(v).toLocaleString()}</span> : <span className="text-slate-300">—</span>
    },
    {
      key: 'running_balance', label: 'Running Balance',
      render: v => {
        const n = Number(v ?? 0)
        return <span className={`font-semibold ${n > 0 ? 'text-red-600' : n < 0 ? 'text-green-600' : 'text-slate-600'}`}>
          ${Math.abs(n).toLocaleString()}
        </span>
      }
    },
    { key: 'status', label: 'Status', render: v => v ? <Badge value={v} /> : null },
  ]

  const totalInvoiced = tenantLedger?.total_invoiced ?? ledgerEntries.reduce((a, e) => a + Number(e.debit ?? 0), 0)
  const totalPaid = tenantLedger?.total_paid ?? ledgerEntries.reduce((a, e) => a + Number(e.credit ?? 0), 0)
  const outstanding = tenantLedger?.outstanding_balance ?? (totalInvoiced - totalPaid)

  // ── RENT STATEMENT (generate + distribute) ──
  const today = new Date()
  const [statementRange, setStatementRange] = useState({
    period_start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
    period_end: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10),
  })
  const [statement, setStatement] = useState(null)
  const [statementLoading, setStatementLoading] = useState(false)
  const [distributing, setDistributing] = useState(false)

  const loadStatement = async () => {
    if (!selectedTenant) { toast.toast('Select a tenant first', 'warning'); return }
    setStatementLoading(true)
    try {
      const res = await reportsAPI.rentStatement({ tenant: selectedTenant, ...statementRange })
      setStatement(res.data)
    } catch {
      toast.toast('Failed to generate statement', 'error')
    } finally {
      setStatementLoading(false)
    }
  }

  const handleDistribute = async () => {
    setDistributing(true)
    try {
      await reportsAPI.distributeRentStatement({ tenant: selectedTenant, ...statementRange, delivery_method: 'in_app' })
      toast.toast('Statement distributed to tenant', 'success')
    } catch {
      toast.toast('Failed to distribute statement', 'error')
    } finally {
      setDistributing(false)
    }
  }

  // ── LANDLORD LEDGER ──
  const [owners, setOwners] = useState([])
  const [selectedOwner, setSelectedOwner] = useState('')
  const [landlordYear, setLandlordYear] = useState(currentYear)
  const [landlordLedger, setLandlordLedger] = useState(null)
  const [landlordLoading, setLandlordLoading] = useState(false)

  useEffect(() => {
    usersAPI.list().then(r => {
      const all = Array.isArray(r.data) ? r.data : r.data?.results ?? []
      setOwners(all.filter(u => u.role === 'owner' || u.role === 'landlord' || u.role === 'admin'))
    }).catch(() => {})
  }, [])

  const loadLandlordLedger = async () => {
    if (!selectedOwner) { toast.toast('Select an owner first', 'warning'); return }
    setLandlordLoading(true)
    try {
      const res = await reportsAPI.landlordLedger(selectedOwner, landlordYear)
      setLandlordLedger(res.data)
    } catch {
      toast.toast('Failed to load landlord ledger', 'error')
    } finally {
      setLandlordLoading(false)
    }
  }

  const monthlyData = landlordLedger?.monthly ?? []
  const chartData = MONTHS.map((m) => {
    // Backend returns month as the abbreviated string ("Jan".."Dec"), matching MONTHS directly.
    const row = monthlyData.find(d => d.month === m) ?? {}
    return {
      month: m,
      gross_rent: Number(row.gross_rent ?? 0),
      net_disbursed: Number(row.net_disbursed ?? 0),
    }
  })

  const landlordMonthlyColumns = [
    { key: 'month', label: 'Month', render: (v) => {
      if (typeof v === 'number') return MONTHS[v - 1]
      return v
    }},
    { key: 'gross_rent', label: 'Gross Rent', render: v => `$${Number(v ?? 0).toLocaleString()}` },
    { key: 'net_disbursed', label: 'Net Disbursed', render: v => <span className="font-semibold text-green-700">${Number(v ?? 0).toLocaleString()}</span> },
    {
      key: 'difference', label: 'Difference (Deductions)',
      render: (v, row) => {
        const diff = Number(row.gross_rent ?? 0) - Number(row.net_disbursed ?? 0)
        return <span className="text-red-600">${diff.toLocaleString()}</span>
      }
    },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Tenant & Owner Ledgers</h1>
        <p className="text-sm text-slate-500 mt-0.5">Financial ledgers for tenants and property owners</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: 'tenant', label: 'Tenant Ledger' },
          { key: 'landlord', label: 'Landlord Ledger' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TENANT LEDGER ── */}
      {activeTab === 'tenant' && (
        <div className="space-y-4">
          {/* Selector */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-48">
                <label className={labelCls}>Tenant</label>
                <select className={`w-full ${inputCls}`} value={selectedTenant}
                  onChange={e => setSelectedTenant(e.target.value)}>
                  <option value="">Select tenant...</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.username}
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={loadTenantLedger} disabled={tenantLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {tenantLoading ? 'Loading...' : 'Load Ledger'}
              </button>
            </div>
          </div>

          {/* Summary cards */}
          {tenantLedger && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard icon={ArrowDownCircle} label="Total Invoiced" value={`$${Number(totalInvoiced).toLocaleString()}`} color="orange" />
                <StatCard icon={ArrowUpCircle} label="Total Paid" value={`$${Number(totalPaid).toLocaleString()}`} color="green" />
                <StatCard icon={DollarSign} label="Outstanding Balance" value={`$${Number(outstanding).toLocaleString()}`} color={Number(outstanding) > 0 ? 'red' : 'green'} />
              </div>

              {/* Ledger table */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Transaction Ledger</h2>
                </div>
                <Table columns={tenantLedgerColumns} data={ledgerEntries} loading={tenantLoading} emptyMessage="No ledger entries found" />
                {/* Total row */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">Totals</span>
                  <div className="flex gap-8 text-sm">
                    <span>Debits: <span className="font-bold text-red-600">${Number(totalInvoiced).toLocaleString()}</span></span>
                    <span>Credits: <span className="font-bold text-green-600">${Number(totalPaid).toLocaleString()}</span></span>
                    <span>Balance: <span className={`font-bold ${Number(outstanding) > 0 ? 'text-red-600' : 'text-green-600'}`}>${Number(outstanding).toLocaleString()}</span></span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Rent Statement generate + distribute */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-3">Rent Statement</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className={labelCls}>Period Start</label>
                <input type="date" className={inputCls} value={statementRange.period_start}
                  onChange={(e) => setStatementRange((f) => ({ ...f, period_start: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Period End</label>
                <input type="date" className={inputCls} value={statementRange.period_end}
                  onChange={(e) => setStatementRange((f) => ({ ...f, period_end: e.target.value }))} />
              </div>
              <button onClick={loadStatement} disabled={statementLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {statementLoading ? 'Generating...' : 'Generate Statement'}
              </button>
              {statement && (
                <button onClick={handleDistribute} disabled={distributing}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {distributing ? 'Sending...' : 'Distribute to Tenant'}
                </button>
              )}
            </div>

            {statement && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex gap-8 text-sm mb-3">
                  <span>Opening Balance: <span className="font-semibold">${Number(statement.opening_balance).toLocaleString()}</span></span>
                  <span>Closing Balance: <span className={`font-bold ${Number(statement.closing_balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>${Number(statement.closing_balance).toLocaleString()}</span></span>
                </div>
                <Table columns={tenantLedgerColumns} data={statement.entries ?? []} loading={false} emptyMessage="No activity in this period" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LANDLORD LEDGER ── */}
      {activeTab === 'landlord' && (
        <div className="space-y-4">
          {/* Selector */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-48">
                <label className={labelCls}>Owner</label>
                <select className={`w-full ${inputCls}`} value={selectedOwner}
                  onChange={e => setSelectedOwner(e.target.value)}>
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
                <select className={inputCls} value={landlordYear} onChange={e => setLandlordYear(Number(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={loadLandlordLedger} disabled={landlordLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {landlordLoading ? 'Loading...' : 'Load Ledger'}
              </button>
            </div>
          </div>

          {landlordLedger && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={Building2} label="Properties" value={landlordLedger.properties?.length ?? 0} color="blue" />
                <StatCard icon={DollarSign} label="Annual Gross Rent" value={`$${Number(landlordLedger.annual_gross_rent ?? 0).toLocaleString()}`} color="blue" />
                <StatCard icon={TrendingDown} label="Annual Net Disbursed" value={`$${Number(landlordLedger.annual_net_disbursed ?? 0).toLocaleString()}`} color="green" />
                <StatCard icon={Users} label="Total Deductions" value={`$${Number(landlordLedger.annual_deductions ?? 0).toLocaleString()}`} color="orange" />
              </div>

              {/* Property list */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                <h3 className="font-semibold text-slate-800 mb-2 text-sm">
                  {landlordLedger.owner_name}'s Properties
                </h3>
                {(landlordLedger.properties ?? []).length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No properties are assigned to this owner. Set the property's owner under Properties before a ledger can show data for them.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {landlordLedger.properties.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-sm text-slate-700">
                        <Building2 size={13} className="text-slate-400" />
                        {p.name}
                        <span className="text-slate-400">· ${Number(p.monthly_rent ?? 0).toLocaleString()}/mo</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Line chart */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-800 mb-4">Gross Rent vs Net Disbursed ({landlordYear})</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                    <Tooltip formatter={v => `$${Number(v).toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="gross_rent" name="Gross Rent" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="net_disbursed" name="Net Disbursed" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly table */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Monthly Breakdown</h2>
                </div>
                <Table columns={landlordMonthlyColumns} data={monthlyData} loading={landlordLoading} emptyMessage="No monthly data" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
