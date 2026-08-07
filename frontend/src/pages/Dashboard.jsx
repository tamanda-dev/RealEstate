import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  Building2, FileText, Wrench, DollarSign, AlertTriangle,
  TrendingUp, Users, BarChart2, ArrowRight, Bell, Clock,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { propertiesAPI, rentAPI, leasesAPI, maintenanceAPI, salesAPI, notificationsAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

function StatCard({ icon: Icon, label, value, color = 'blue', to, sublabel }) {
  const colorMap = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100' },
  }
  const c = colorMap[color] || colorMap.blue

  const inner = (
    <div className={`bg-white rounded-xl border ${c.border} p-5 flex items-center gap-4 hover:shadow-md transition-shadow group`}>
      <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={22} className={c.text} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5 leading-tight">{value ?? '—'}</p>
        {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
      </div>
      {to && <ArrowRight size={16} className="ml-auto text-slate-300 group-hover:text-slate-500 transition-colors" />}
    </div>
  )

  return to ? <Link to={to}>{inner}</Link> : inner
}

function AlertCard({ type, title, message, to, count }) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  const icons = {
    error: <AlertTriangle size={16} className="text-red-500" />,
    warning: <Clock size={16} className="text-amber-500" />,
    info: <Bell size={16} className="text-blue-500" />,
  }
  return (
    <Link to={to || '#'}
      className={`flex items-start gap-3 p-3 rounded-lg border ${styles[type]} hover:opacity-80 transition-opacity`}>
      <span className="flex-shrink-0 mt-0.5">{icons[type]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs mt-0.5 opacity-80">{message}</p>
      </div>
      {count > 0 && (
        <span className="flex-shrink-0 bg-white/70 text-xs font-bold px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </Link>
  )
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-100 rounded ${className}`} />
}

export default function Dashboard() {
  const { user } = useAuth()
  // Landlords/owners have their own dedicated portal (with data properly scoped to their
  // own properties) — this shared Dashboard pulls portfolio-wide stats across every
  // property in the system, which is never appropriate for them to see.
  const isLandlord = user?.role === 'landlord' || user?.role === 'owner'
  const isInternalStaff = !!user?.is_internal_staff
  const [stats, setStats] = useState({ properties: null, rent: null, leases: null, maintenance: null, sales: null })
  const [analytics, setAnalytics] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const greet = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const fmt = (v) => v != null ? Number(v).toLocaleString() : '—'
  const fmtCurrency = (v) => v != null
    ? `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : '—'
  const fmtPct = (v) => v != null ? `${v}%` : '—'

  useEffect(() => {
    if (isLandlord) return // redirected below — skip the portfolio-wide fetch entirely
    const load = async () => {
      setLoading(true)
      const [prop, rent, lease, maint, sale, analytics, notif] = await Promise.allSettled([
        propertiesAPI.stats(),
        rentAPI.invoices.stats(),
        leasesAPI.stats(),
        maintenanceAPI.workOrders.stats(),
        salesAPI.listings.stats(),
        propertiesAPI.portfolioAnalytics(),
        notificationsAPI.unreadCount(),
      ])
      setStats({
        properties: prop.status === 'fulfilled' ? prop.value.data : null,
        rent: rent.status === 'fulfilled' ? rent.value.data : null,
        leases: lease.status === 'fulfilled' ? lease.value.data : null,
        maintenance: maint.status === 'fulfilled' ? maint.value.data : null,
        sales: sale.status === 'fulfilled' ? sale.value.data : null,
      })
      if (analytics.status === 'fulfilled') setAnalytics(analytics.value.data)
      if (notif.status === 'fulfilled') setUnreadCount(notif.value.data.count)
      setLoading(false)
    }
    load()
  }, [isLandlord])

  const s = stats
  const hasAlerts = (
    (s.rent?.overdue_count > 0) ||
    (s.leases?.expiring_60_days > 0) ||
    (s.maintenance?.emergency > 0)
  )

  // Pie data for property types
  const pieData = analytics?.by_type?.map((t, i) => ({
    name: t.property_type.replace('_', ' '),
    value: t.count,
    color: COLORS[i % COLORS.length],
  })) || []

  // Monthly chart data
  const chartData = analytics?.monthly_data?.filter(d => d.revenue > 0 || d.expenses > 0) || []

  if (isLandlord) return <Navigate to="/seller-portal" replace />

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {greet()}{user?.first_name ? `, ${user.first_name}` : ''}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link to="/notifications"
          className="relative p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          <Bell size={20} className="text-slate-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>

      {/* Alerts */}
      {!loading && hasAlerts && (
        <div className="space-y-2">
          {s.rent?.overdue_count > 0 && (
            <AlertCard type="error" to="/rent"
              title="Overdue Rent"
              message={`${s.rent.overdue_count} invoice(s) overdue — ${fmtCurrency(s.rent.overdue_amount)} outstanding`}
              count={s.rent.overdue_count} />
          )}
          {s.leases?.expiring_60_days > 0 && (
            <AlertCard type="warning" to="/leases"
              title="Leases Expiring Soon"
              message={`${s.leases.expiring_60_days} lease(s) expiring within 60 days — renewal action needed`}
              count={s.leases.expiring_60_days} />
          )}
          {s.maintenance?.emergency > 0 && (
            <AlertCard type="error" to="/maintenance"
              title="Emergency Work Orders"
              message={`${s.maintenance.emergency} emergency work order(s) unresolved`}
              count={s.maintenance.emergency} />
          )}
        </div>
      )}

      {/* KPI Grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Building2} label="Total Properties" color="blue" to="/properties"
            value={fmt(s.properties?.total)}
            sublabel={`${fmt(s.properties?.available)} available`} />
          <StatCard icon={Users} label="Occupancy Rate" color="green"
            value={fmtPct(s.properties?.occupancy_rate)}
            sublabel={`${fmt(s.properties?.occupied_units)} / ${fmt(s.properties?.total_units)} units`} />
          <StatCard icon={FileText} label="Active Leases" color="blue" to="/leases"
            value={fmt(s.leases?.active)}
            sublabel={`${fmt(s.leases?.expiring_60_days)} expiring soon`} />
          <StatCard icon={Wrench} label="Open Work Orders" color="amber" to="/maintenance"
            value={fmt(s.maintenance?.open)}
            sublabel={`${fmt(s.maintenance?.in_progress)} in progress`} />
          <StatCard icon={DollarSign} label="Rent Collected" color="green" to="/rent"
            value={fmtCurrency(s.rent?.total_collected)}
            sublabel={`${fmt(s.rent?.pending_count)} pending`} />
          <StatCard icon={AlertTriangle} label="Overdue Amount" color="red" to="/rent"
            value={fmtCurrency(s.rent?.overdue_amount)}
            sublabel={`${fmt(s.rent?.overdue_count)} invoices`} />
          <StatCard icon={TrendingUp} label="Portfolio Value" color="purple"
            value={fmtCurrency(s.properties?.total_value)}
            sublabel={`Avg rent ${fmtCurrency(s.properties?.avg_rent)}/mo`} />
          <StatCard icon={BarChart2} label="Active Listings" color="slate" to="/sales"
            value={fmt(s.sales?.active)}
            sublabel={`${fmt(s.sales?.pending)} pending sale`} />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Revenue vs Expenses bar chart */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Revenue vs Expenses — {analytics?.year || new Date().getFullYear()}</h2>
            <Link to="/analytics" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View full analytics <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <Skeleton className="h-52" />
          ) : !chartData.length ? (
            <div className="h-52 flex items-center justify-center text-slate-400 text-sm">
              No revenue or expense data recorded yet for {analytics?.year || new Date().getFullYear()}.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                <Tooltip formatter={(v, n) => [`$${v.toLocaleString()}`, n === 'revenue' ? 'Revenue' : 'Expenses']} />
                <Legend formatter={v => v === 'revenue' ? 'Revenue' : 'Expenses'} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[3,3,0,0]} />
                <Bar dataKey="expenses" fill="#f59e0b" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Portfolio by type donut */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Portfolio by Type</h2>
          {loading ? (
            <Skeleton className="h-52" />
          ) : !pieData.length ? (
            <div className="h-52 flex items-center justify-center text-slate-400 text-sm">No properties added yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                  paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
                <Legend iconSize={10} formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Maintenance summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Maintenance Overview</h2>
            <Link to="/maintenance" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {loading ? <Skeleton className="h-28" /> : (
            <div className="space-y-3">
              {[
                { label: 'Open', value: s.maintenance?.open, dot: 'bg-amber-400' },
                { label: 'In Progress', value: s.maintenance?.in_progress, dot: 'bg-blue-500' },
                { label: 'Assigned', value: s.maintenance?.assigned, dot: 'bg-purple-400' },
                { label: 'Completed', value: s.maintenance?.completed, dot: 'bg-green-500' },
                { label: 'Emergency', value: s.maintenance?.emergency, dot: 'bg-red-500' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${r.dot}`} />
                    <span className="text-sm text-slate-600">{r.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">{fmt(r.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lease summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Lease Summary</h2>
            <Link to="/leases" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {loading ? <Skeleton className="h-28" /> : (
            <div className="space-y-3">
              {[
                { label: 'Active', value: s.leases?.active, dot: 'bg-green-500' },
                { label: 'Expiring in 60 days', value: s.leases?.expiring_60_days, dot: 'bg-amber-400' },
                { label: 'Renewal Pending', value: s.leases?.renewal_pending, dot: 'bg-blue-400' },
                { label: 'Expired', value: s.leases?.expired, dot: 'bg-red-400' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${r.dot}`} />
                    <span className="text-sm text-slate-600">{r.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">{fmt(r.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions — internal staff only; tenants/landlords/buyers get no operational shortcuts here */}
      {isInternalStaff && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { to: '/properties', label: 'Add Property', icon: Building2, color: 'bg-blue-600' },
              { to: '/rent', label: 'Record Payment', icon: DollarSign, color: 'bg-green-600' },
              { to: '/maintenance', label: 'New Work Order', icon: Wrench, color: 'bg-amber-600' },
              { to: '/leases', label: 'New Lease', icon: FileText, color: 'bg-purple-600' },
              { to: '/sales', label: 'New Listing', icon: TrendingUp, color: 'bg-rose-600' },
              { to: '/analytics', label: 'View Analytics', icon: BarChart2, color: 'bg-slate-700' },
            ].map(({ to, label, icon: Icon, color }) => (
              <Link key={to} to={to}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium ${color} hover:opacity-90 transition-opacity`}>
                <Icon size={15} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
