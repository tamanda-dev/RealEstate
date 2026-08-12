import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, Building2, FileText, Wrench, DollarSign, BarChart2,
  BookOpen, Users, LogOut, Menu, Bell, Receipt, TrendingUp,
  Users2, Calculator, CalendarCheck, RefreshCw, PieChart, Shield, FolderOpen, MessageCircle,
  ClipboardCheck, Percent, BookMarked, Home as HomeIcon, UserCog,
  Heart, Eye, Tag, Star, LayoutDashboard, HandCoins, ShieldAlert, MessageSquareText,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { notificationsAPI } from '../services/api'

// roles[] = which roles can see this item. Empty/undefined = all authenticated users.
const INTERNAL = ['admin','sales_manager','property_manager','valuation_manager','accountant','agent','manager']
const SALES     = ['admin','sales_manager','agent','manager']
const PROP_MGMT = ['admin','property_manager','manager','accountant']
const FINANCE   = ['admin','accountant','property_manager','manager']
const VALUATION = ['admin','valuation_manager','agent','sales_manager']

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: Home, end: true },
      { to: '/analytics', label: 'Analytics', icon: BarChart2, roles: INTERNAL },
      { to: '/crm', label: 'CRM / Leads', icon: Users2, roles: SALES },
    ],
  },
  {
    label: 'Buyer Portal',
    roles: ['buyer'],   // entire group only shown to buyers
    items: [
      { to: '/buyer-portal', label: 'Browse Listings', icon: Home },
      { to: '/buyer-portal/favourites', label: 'My Favourites', icon: Heart },
      { to: '/buyer-portal/viewings', label: 'My Viewings', icon: Eye },
      { to: '/buyer-portal/offers', label: 'My Offers', icon: Tag },
    ],
  },
  {
    label: 'Seller / Landlord',
    roles: ['landlord', 'owner'],
    items: [
      { to: '/seller-portal', label: 'My Portfolio', icon: LayoutDashboard },
      { to: '/seller-portal/offers', label: 'Offers Received', icon: HandCoins },
    ],
  },
  {
    label: 'Property Management',
    roles: PROP_MGMT.concat(['agent']),
    items: [
      { to: '/properties', label: 'Properties', icon: Building2, roles: INTERNAL },
      { to: '/rent', label: 'Rent Collection', icon: DollarSign, roles: PROP_MGMT.concat(['agent','tenant']) },
      { to: '/leases', label: 'Leases', icon: FileText, roles: PROP_MGMT.concat(['agent','tenant']) },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench, roles: PROP_MGMT.concat(['agent','tenant']) },
      { to: '/preventive', label: 'Preventive Maint.', icon: Shield, roles: PROP_MGMT },
      { to: '/documents', label: 'Documents', icon: FolderOpen, roles: INTERNAL },
      { to: '/inspections', label: 'Inspections', icon: ClipboardCheck, roles: PROP_MGMT },
    ],
  },
  {
    label: 'Tenant',
    roles: ['tenant'],
    items: [
      { to: '/rent', label: 'My Invoices', icon: DollarSign },
      { to: '/maintenance', label: 'Maintenance Requests', icon: Wrench },
      { to: '/documents', label: 'Documents', icon: FolderOpen },
    ],
  },
  {
    label: 'Sales',
    roles: SALES,
    items: [
      { to: '/sales', label: 'Sales & CRM', icon: Users },
      { to: '/quotations', label: 'Quotations', icon: Calculator },
      { to: '/reservations', label: 'Reservations', icon: CalendarCheck },
      { to: '/sales-manager', label: 'Sales Pipeline', icon: Star, roles: ['admin','sales_manager'] },
    ],
  },
  {
    label: 'Financials',
    roles: FINANCE,
    items: [
      { to: '/valuation', label: 'Valuation', icon: TrendingUp, roles: VALUATION },
      { to: '/valuation-workbench', label: 'Valuation Workbench', icon: Calculator, roles: VALUATION },
      { to: '/expenses', label: 'Expenses', icon: Receipt, roles: FINANCE },
      { to: '/accounting', label: 'Accounting', icon: BookOpen, roles: FINANCE },
      { to: '/currency', label: 'USD / ZiG Rates', icon: RefreshCw, roles: FINANCE },
      { to: '/reports', label: 'Reports', icon: PieChart, roles: INTERNAL },
      { to: '/commissions', label: 'Commissions & VAT', icon: Percent, roles: FINANCE },
      { to: '/tenant-ledger', label: 'Ledgers', icon: BookMarked, roles: FINANCE },
      { to: '/landlord-portal', label: 'Landlord Portal', icon: HomeIcon, roles: PROP_MGMT },
      { to: '/aml', label: 'AML / Compliance', icon: ShieldAlert, roles: ['admin', 'accountant'] },
    ],
  },
  {
    label: 'Communications',
    roles: SALES,
    items: [
      { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
      { to: '/messaging', label: 'SMS / Email', icon: MessageSquareText },
    ],
  },
  {
    label: 'Administration',
    roles: ['admin','sales_manager','property_manager','manager'],
    items: [
      { to: '/users', label: 'User Management', icon: UserCog, roles: ['admin','manager'] },
    ],
  },
]

function NavItem({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
        }`
      }>
      <Icon size={17} />
      {label}
    </NavLink>
  )
}

function Sidebar({ user, onNav, onLogout }) {
  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/50">
        <img src="/favicon.svg" alt="PropManager ZW" className="w-9 h-9 flex-shrink-0" />
        <div>
          <p className="text-white font-bold text-sm leading-tight tracking-tight">PropManager</p>
          <p className="text-slate-400 text-xs flex items-center gap-1.5">
            <span className="inline-block bg-amber-500 text-slate-900 text-[9px] font-black px-1.5 py-0.5 rounded leading-none tracking-wide">ZW</span>
            Real Estate Suite
          </p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => {
          const role = user?.role
          // Filter entire group by group-level roles
          if (group.roles && !group.roles.includes(role)) return null
          // Filter individual items
          const visibleItems = group.items.filter(item =>
            !item.roles || item.roles.includes(role)
          )
          if (visibleItems.length === 0) return null
          return (
            <div key={group.label}>
              <p className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavItem key={item.to} {...item} onClick={onNav} />
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">
            {user?.first_name?.[0]?.toUpperCase() ?? user?.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">
              {user?.first_name && user?.last_name
                ? `${user.first_name} ${user.last_name}`
                : user?.username ?? 'User'}
            </p>
            <p className="text-xs text-slate-400 capitalize truncate">{user?.role ?? 'Staff'}</p>
          </div>
          <button onClick={onLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
            title="Logout">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data } = await notificationsAPI.unreadCount()
        setUnreadCount(data.count)
      } catch {}
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 shadow-xl">
        <Sidebar user={user} onNav={() => {}} onLogout={handleLogout} />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex flex-col w-60 h-full shadow-2xl">
            <Sidebar user={user} onNav={() => setSidebarOpen(false)} onLogout={handleLogout} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-100 px-4 lg:px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <button className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <div className="flex-1" />

          {/* Notification bell */}
          <NavLink to="/notifications"
            className={({ isActive }) =>
              `relative p-2 rounded-xl transition-colors ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`
            }>
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>

          {/* User badge + avatar */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
              {user?.role ?? 'staff'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
              {user?.first_name?.[0]?.toUpperCase() ?? user?.username?.[0]?.toUpperCase() ?? 'U'}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
