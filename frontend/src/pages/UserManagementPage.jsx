import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Search, Shield, KeyRound, UserCheck, UserX,
  Edit3, RefreshCw, Building2, TrendingUp, BookOpen, BarChart2,
  Home, Tag, User, Briefcase, ChevronRight, Lock, Phone, Mail,
  CheckCircle2, ListChecks, ArrowLeft,
} from 'lucide-react'
import api, { propertiesAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

const fieldErrorText = (errors, field) => {
  const v = errors?.[field]
  if (!v) return null
  return Array.isArray(v) ? v.join(' ') : String(v)
}

const FieldError = ({ errors, field }) => {
  const text = fieldErrorText(errors, field)
  return text ? <p className="text-xs text-red-600 mt-1">{text}</p> : null
}

// ── Role definitions ──────────────────────────────────────────────────────────
const STAFF_ROLES = [
  {
    value: 'admin',
    label: 'System Administrator',
    icon: Shield,
    color: 'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    desc: 'Full access to all modules, users, and settings.',
  },
  {
    value: 'sales_manager',
    label: 'Sales Manager',
    icon: TrendingUp,
    color: 'bg-orange-500',
    badge: 'bg-orange-100 text-orange-700',
    desc: 'Manages the sales team, listings, leads, and commissions.',
  },
  {
    value: 'property_manager',
    label: 'Property Manager',
    icon: Building2,
    color: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    desc: 'Manages rental properties, leases, maintenance, and tenants.',
  },
  {
    value: 'valuation_manager',
    label: 'Valuation Manager',
    icon: BarChart2,
    color: 'bg-cyan-600',
    badge: 'bg-cyan-100 text-cyan-700',
    desc: 'Conducts property valuations and market analysis.',
  },
  {
    value: 'accountant',
    label: 'Accountant / Finance',
    icon: BookOpen,
    color: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    desc: 'Manages accounts, invoices, trust accounts, and VAT returns.',
  },
  {
    value: 'agent',
    label: 'Real Estate Agent',
    icon: Briefcase,
    color: 'bg-indigo-500',
    badge: 'bg-indigo-100 text-indigo-700',
    desc: 'Handles listings, buyer leads, viewings, and offers.',
  },
]

const CLIENT_ROLES = [
  {
    value: 'landlord',
    label: 'Landlord / Seller',
    icon: Home,
    color: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-700',
    desc: 'Owns property listed for sale or rental with the agency. Can view their portfolio and received offers.',
  },
  {
    value: 'tenant',
    label: 'Tenant / Renter',
    icon: User,
    color: 'bg-green-500',
    badge: 'bg-green-100 text-green-700',
    desc: 'Currently renting a property managed by the agency. Can view invoices and log maintenance requests.',
  },
  {
    value: 'buyer',
    label: 'Buyer / Prospective Renter',
    icon: Tag,
    color: 'bg-teal-500',
    badge: 'bg-teal-100 text-teal-700',
    desc: 'Looking to purchase or rent a property. Can browse listings, schedule viewings, and submit offers.',
  },
]

const ALL_ROLES = [...STAFF_ROLES, ...CLIENT_ROLES]

const roleInfo  = (role) => ALL_ROLES.find(r => r.value === role)
const roleLabel = (role) => roleInfo(role)?.label ?? role
const roleBadge = (role) => roleInfo(role)?.badge ?? 'bg-slate-100 text-slate-600'
const roleColor = (role) => roleInfo(role)?.color ?? 'bg-slate-400'

// ── Small components ──────────────────────────────────────────────────────────
function RolePill({ role }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${roleBadge(role)}`}>
      {roleLabel(role)}
    </span>
  )
}

function Avatar({ user, size = 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  const letter = (user.first_name?.[0] ?? user.username?.[0] ?? 'U').toUpperCase()
  return (
    <div className={`${sz} rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 ${roleColor(user.role)}`}>
      {letter}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const { user: me } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')           // all | staff | clients
  const [filterActive, setFilterActive] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showEditRole, setShowEditRole] = useState(null)
  const [showResetPw, setShowResetPw] = useState(null)
  const [showEditProfile, setShowEditProfile] = useState(null)

  const isAdmin = me?.role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterActive !== '') params.is_active = filterActive
      const [usersRes, statsRes] = await Promise.all([
        api.get('/users/', { params }),
        api.get('/users/dashboard_stats/'),
      ])
      setUsers(usersRes.data.results ?? usersRes.data)
      setStats(statsRes.data)
    } catch {
      toast('Failed to load users', 'error')
    } finally {
      setLoading(false)
    }
  }, [filterActive])

  useEffect(() => { load() }, [load])

  const staffRoleValues  = STAFF_ROLES.map(r => r.value)
  const clientRoleValues = CLIENT_ROLES.map(r => r.value)

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      `${u.first_name} ${u.last_name} ${u.username} ${u.email} ${u.phone}`.toLowerCase().includes(search.toLowerCase())
    const matchTab =
      tab === 'all'     ? true :
      tab === 'staff'   ? staffRoleValues.includes(u.role) :
      tab === 'clients' ? clientRoleValues.includes(u.role) : true
    return matchSearch && matchTab
  })

  const handleDeactivate = async (user) => {
    if (!window.confirm(`Deactivate ${user.first_name || user.username}? They will lose all access immediately.`)) return
    try {
      await api.post(`/users/${user.id}/deactivate/`)
      toast(`${user.first_name || user.username} deactivated`, 'success')
      load()
    } catch (err) {
      toast(err?.response?.data?.error || 'Failed to deactivate', 'error')
    }
  }

  const handleActivate = async (user) => {
    try {
      await api.post(`/users/${user.id}/activate/`)
      toast(`${user.first_name || user.username} reactivated`, 'success')
      load()
    } catch {
      toast('Failed to reactivate', 'error')
    }
  }

  const staffCount  = users.filter(u => staffRoleValues.includes(u.role)).length
  const clientCount = users.filter(u => clientRoleValues.includes(u.role)).length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage staff accounts and client access</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-colors">
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Users',  value: stats?.total ?? 0,    color: 'bg-blue-600',   icon: Users },
          { label: 'Active',       value: stats?.active ?? 0,   color: 'bg-green-600',  icon: UserCheck },
          { label: 'Staff',        value: staffCount,            color: 'bg-indigo-600', icon: Briefcase },
          { label: 'Clients',      value: clientCount,           color: 'bg-purple-600', icon: User },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center flex-shrink-0`}>
              <s.icon size={18} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Tab bar + filters */}
        <div className="px-4 pt-4 pb-0 border-b border-slate-100">
          <div className="flex items-end gap-6 mb-0">
            {[
              { key: 'all',     label: `All Users (${users.length})` },
              { key: 'staff',   label: `Staff (${staffCount})` },
              { key: 'clients', label: `Clients (${clientCount})` },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
              </button>
            ))}
            <div className="flex-1" />
            {/* Filters */}
            <div className="flex items-center gap-2 pb-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <select value={filterActive} onChange={e => setFilterActive(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              <button onClick={load} title="Refresh"
                className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-40" />
                  <div className="h-3 bg-slate-100 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <Users size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">No users found</p>
            <p className="text-sm mt-1">Try a different filter or add a new user.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/60">
                <th className="px-5 py-3 text-left">User</th>
                <th className="px-5 py-3 text-left">Role</th>
                <th className="px-5 py-3 text-left">Contact</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Joined</th>
                {isAdmin && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(user => (
                <tr key={user.id}
                  className={`hover:bg-slate-50/60 transition-colors ${!user.is_active ? 'opacity-50' : ''}`}>

                  {/* User column */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar user={user} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800 text-sm">
                            {user.first_name && user.last_name
                              ? `${user.first_name} ${user.last_name}`
                              : user.username}
                          </p>
                          {user.id === me?.id && (
                            <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">YOU</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">@{user.username}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-3.5"><RolePill role={user.role} /></td>

                  {/* Contact */}
                  <td className="px-5 py-3.5">
                    <div className="space-y-0.5">
                      {user.email && (
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Mail size={11} className="text-slate-300" /> {user.email}
                        </p>
                      )}
                      {user.phone && (
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Phone size={11} className="text-slate-300" /> {user.phone}
                        </p>
                      )}
                      {!user.email && !user.phone && <span className="text-xs text-slate-300">—</span>}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      user.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Joined */}
                  <td className="px-5 py-3.5 text-xs text-slate-400">
                    {user.date_joined
                      ? new Date(user.date_joined).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>

                  {/* Actions */}
                  {isAdmin && (
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn icon={Edit3}    title="Edit Profile"     color="blue"   onClick={() => setShowEditProfile(user)} />
                        <ActionBtn icon={Shield}   title="Change Role"      color="purple" onClick={() => setShowEditRole(user)} />
                        <ActionBtn icon={KeyRound} title="Reset Password"   color="amber"  onClick={() => setShowResetPw(user)} />
                        {user.id !== me?.id && (
                          user.is_active
                            ? <ActionBtn icon={UserX}   title="Deactivate" color="red"   onClick={() => handleDeactivate(user)} />
                            : <ActionBtn icon={UserCheck} title="Reactivate" color="green" onClick={() => handleActivate(user)} />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="px-5 py-2.5 text-xs text-slate-400 border-t border-slate-50 bg-slate-50/30">
          Showing {filtered.length} of {users.length} users
        </div>
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
          toast={toast} />
      )}
      {showEditProfile && (
        <EditProfileModal
          user={showEditProfile}
          onClose={() => setShowEditProfile(null)}
          onSaved={() => { setShowEditProfile(null); load() }}
          toast={toast} />
      )}
      {showEditRole && (
        <ChangeRoleModal
          user={showEditRole}
          currentUser={me}
          onClose={() => setShowEditRole(null)}
          onSaved={() => { setShowEditRole(null); load() }}
          toast={toast} />
      )}
      {showResetPw && (
        <ResetPasswordModal
          user={showResetPw}
          onClose={() => setShowResetPw(null)}
          toast={toast} />
      )}
    </div>
  )
}

function ActionBtn({ icon: Icon, title, color, onClick }) {
  const cls = {
    blue:   'hover:text-blue-600 hover:bg-blue-50',
    purple: 'hover:text-purple-600 hover:bg-purple-50',
    amber:  'hover:text-amber-600 hover:bg-amber-50',
    red:    'hover:text-red-600 hover:bg-red-50',
    green:  'hover:text-green-600 hover:bg-green-50',
  }[color]
  return (
    <button title={title} onClick={onClick}
      className={`p-1.5 rounded-lg text-slate-300 transition-colors ${cls}`}>
      <Icon size={14} />
    </button>
  )
}

// ── Create User Modal ─────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onSaved, toast }) {
  // Step 1: pick category; Step 2: pick role; Step 3: fill details; Step 4 (landlords only): properties
  const [step, setStep] = useState(1)
  const [category, setCategory] = useState(null)   // 'staff' | 'client'
  const [form, setForm] = useState({
    first_name: '', last_name: '', username: '',
    email: '', phone: '', role: '', password: '', confirm_password: '',
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [createdUser, setCreatedUser] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectCategory = (cat) => { setCategory(cat); setStep(2) }
  const selectRole = (role) => { set('role', role); setStep(3) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const res = await api.post('/users/', form)
      toast(`${form.first_name} ${form.last_name} added as ${roleLabel(form.role)}`, 'success')
      if (form.role === 'landlord') {
        setCreatedUser(res.data)
        setStep(4)
      } else {
        onSaved()
      }
    } catch (err) {
      const data = err?.response?.data
      if (data && typeof data === 'object') setErrors(data)
      else toast('Failed to create user', 'error')
    } finally {
      setSaving(false)
    }
  }

  const roleList = category === 'staff' ? STAFF_ROLES : CLIENT_ROLES
  const selectedRole = ALL_ROLES.find(r => r.value === form.role)
  const pwMatch = form.password === form.confirm_password
  const stepLabels = form.role === 'landlord'
    ? ['User Type', 'Role', 'Details', 'Properties']
    : ['User Type', 'Role', 'Details']

  return (
    <Modal open={true} onClose={onClose} title="Add New User" size="lg">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {stepLabels.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              step > i + 1 ? 'bg-green-500 text-white' :
              step === i + 1 ? 'bg-blue-600 text-white' :
              'bg-slate-100 text-slate-400'
            }`}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-medium ${step === i + 1 ? 'text-slate-800' : 'text-slate-400'}`}>{s}</span>
            {i < stepLabels.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Category ── */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-slate-600 text-sm mb-4">
            Who are you adding to the system?
          </p>
          <button onClick={() => selectCategory('staff')}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-600 transition-colors">
              <Briefcase size={22} className="text-blue-600 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-800 text-sm">Company Staff / Employee</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Admin, Sales Manager, Property Manager, Valuation Manager, Accountant, or Agent
              </p>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
          </button>
          <button onClick={() => selectCategory('client')}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-left group">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-600 transition-colors">
              <Users size={22} className="text-purple-600 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-800 text-sm">Client / External Party</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Landlord / Seller, Tenant / Renter, or Buyer / Prospective Renter
              </p>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-purple-500 transition-colors" />
          </button>
        </div>
      )}

      {/* ── Step 2: Role selection ── */}
      {step === 2 && (
        <div className="space-y-2">
          <p className="text-slate-600 text-sm mb-4">
            Select the {category === 'staff' ? 'staff position' : 'client type'}:
          </p>
          {roleList.map(r => (
            <button key={r.value} onClick={() => selectRole(r.value)}
              className="w-full flex items-center gap-4 p-3.5 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group">
              <div className={`w-10 h-10 rounded-xl ${r.color} flex items-center justify-center flex-shrink-0`}>
                <r.icon size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">{r.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
            </button>
          ))}
          <button onClick={() => setStep(1)}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline">
            ← Back
          </button>
        </div>
      )}

      {/* ── Step 3: Details form ── */}
      {step === 3 && selectedRole && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role banner */}
          <div className={`flex items-center gap-3 p-3 rounded-xl ${selectedRole.badge.replace('text-', 'bg-').split(' ')[0]}/10 border border-slate-100`}>
            <div className={`w-9 h-9 rounded-lg ${selectedRole.color} flex items-center justify-center flex-shrink-0`}>
              <selectedRole.icon size={16} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Creating account as</p>
              <p className="font-bold text-slate-800 text-sm">{selectedRole.label}</p>
            </div>
            <button type="button" onClick={() => setStep(2)}
              className="ml-auto text-xs text-blue-600 hover:underline">Change</button>
          </div>

          {errors.non_field_errors && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-lg p-3 text-sm">
              {errors.non_field_errors}
            </div>
          )}

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name *</label>
              <input required value={form.first_name} onChange={e => set('first_name', e.target.value)}
                placeholder="e.g. Tendai"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {errors.first_name && <p className="text-xs text-red-600 mt-1">{errors.first_name[0]}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name *</label>
              <input required value={form.last_name} onChange={e => set('last_name', e.target.value)}
                placeholder="e.g. Moyo"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {errors.last_name && <p className="text-xs text-red-600 mt-1">{errors.last_name[0]}</p>}
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Username *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
              <input required value={form.username} onChange={e => set('username', e.target.value)}
                autoComplete="off"
                placeholder="unique login name"
                className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {errors.username && <p className="text-xs text-red-600 mt-1">{errors.username[0]}</p>}
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="name@email.com"
                  className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email[0]}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input value={form.phone} onChange={e => set('phone', e.target.value)}
                  placeholder="+263 77 123 4567"
                  className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input required type="password" value={form.password} onChange={e => set('password', e.target.value)}
                  autoComplete="new-password" minLength={8}
                  placeholder="min. 8 characters"
                  className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password[0]}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm Password *</label>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input required type="password" value={form.confirm_password} onChange={e => set('confirm_password', e.target.value)}
                  autoComplete="new-password" minLength={8}
                  placeholder="repeat password"
                  className={`w-full border rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    form.confirm_password && !pwMatch
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-slate-200 focus:ring-blue-500'
                  }`} />
              </div>
              {form.confirm_password && !pwMatch && (
                <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
              )}
            </div>
          </div>

          {/* Live preview */}
          {(form.first_name || form.username) && (
            <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3 border border-slate-100">
              <div className={`w-10 h-10 rounded-xl ${selectedRole.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                {(form.first_name?.[0] ?? form.username?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">
                  {[form.first_name, form.last_name].filter(Boolean).join(' ') || form.username}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedRole.badge}`}>
                  {selectedRole.label}
                </span>
              </div>
              {form.phone && <p className="ml-auto text-xs text-slate-400">{form.phone}</p>}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <button type="button" onClick={() => setStep(2)}
              className="text-sm text-slate-400 hover:text-slate-600 underline">
              ← Back
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button type="submit"
                disabled={saving || !pwMatch || !form.password || !form.username || !form.first_name}
                className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-semibold transition-colors">
                {saving ? 'Creating…' : `Create ${selectedRole.label}`}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Step 4: Property portfolio (landlords only) ── */}
      {step === 4 && createdUser && (
        <LandlordPropertyStep landlord={createdUser} onFinish={onSaved} toast={toast} />
      )}
    </Modal>
  )
}

// ── Landlord property portfolio setup (shown right after a landlord account is created) ──
const emptyLandlordPropertyForm = {
  purpose: 'rent',
  name: '', address: '', city: '', state: '', country: 'Zimbabwe',
  property_type: 'residential', status: 'available',
  bedrooms: '', bathrooms: '', square_feet: '', year_built: '',
  monthly_rent: '', current_value: '', description: '',
}

function LandlordPropertyStep({ landlord, onFinish, toast }) {
  const [mode, setMode] = useState(null)          // null | 'new' | 'existing'
  const [addedCount, setAddedCount] = useState(0)

  // ── "Add new property" sub-form ──
  const [propForm, setPropForm] = useState(emptyLandlordPropertyForm)
  const [savingProperty, setSavingProperty] = useState(false)
  const [propError, setPropError] = useState('')
  const [propErrors, setPropErrors] = useState({})

  const setPurpose = (purpose) => {
    setPropForm(f => ({
      ...f, purpose,
      status: purpose === 'rent' ? 'available' : 'listed_for_sale',
      monthly_rent: '', current_value: '',
    }))
  }

  const handleAddProperty = async (e) => {
    e.preventDefault()
    setSavingProperty(true)
    setPropError('')
    setPropErrors({})
    try {
      const { purpose, ...payload } = propForm
      if (purpose === 'rent') delete payload.current_value
      if (purpose === 'sale') delete payload.monthly_rent
      payload.owner = landlord.id
      await propertiesAPI.create(payload)
      setAddedCount(c => c + 1)
      toast('Property added to portfolio', 'success')
      setPropForm(emptyLandlordPropertyForm)
      setMode(null)
    } catch (err) {
      const data = err?.response?.data
      if (data && typeof data === 'object') {
        setPropErrors(data)
        const generic = data.detail ?? data.non_field_errors
        setPropError(generic ? (Array.isArray(generic) ? generic.join(' ') : generic) : '')
      } else {
        setPropError(typeof data === 'string' ? data : 'Failed to add property.')
      }
    } finally {
      setSavingProperty(false)
    }
  }

  // ── "Assign existing unowned property" sub-view ──
  const [unowned, setUnowned] = useState(null)     // null = not loaded yet
  const [loadingUnowned, setLoadingUnowned] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [assigning, setAssigning] = useState(false)

  const openExisting = async () => {
    setMode('existing')
    setSelectedIds([])
    if (unowned !== null) return
    setLoadingUnowned(true)
    try {
      const res = await propertiesAPI.unassigned()
      setUnowned(res.data.results ?? res.data)
    } catch {
      toast('Failed to load unassigned properties', 'error')
      setUnowned([])
    } finally {
      setLoadingUnowned(false)
    }
  }

  const toggleSelected = (id) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  const handleAssign = async () => {
    setAssigning(true)
    try {
      await Promise.all(selectedIds.map(id => propertiesAPI.assignOwner(id, landlord.id)))
      setAddedCount(c => c + selectedIds.length)
      toast(`${selectedIds.length} propert${selectedIds.length === 1 ? 'y' : 'ies'} assigned to ${landlord.first_name || landlord.username}`, 'success')
      setUnowned(u => u.filter(p => !selectedIds.includes(p.id)))
      setSelectedIds([])
      setMode(null)
    } catch {
      toast('Failed to assign one or more properties', 'error')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 border border-purple-100">
        <div className="w-9 h-9 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={16} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-slate-800 text-sm">
            {landlord.first_name || landlord.username} was added as a Landlord
          </p>
          <p className="text-xs text-slate-500">
            {addedCount > 0
              ? `${addedCount} propert${addedCount === 1 ? 'y' : 'ies'} linked so far. Add more or finish below.`
              : 'Give them a property portfolio now, or skip and do it later.'}
          </p>
        </div>
      </div>

      {/* ── Choice screen ── */}
      {mode === null && (
        <div className="space-y-3">
          <button onClick={() => setMode('new')}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-600 transition-colors">
              <Plus size={22} className="text-blue-600 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-800 text-sm">Add a New Property</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Create a brand-new listing owned by {landlord.first_name || landlord.username}.
              </p>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
          </button>
          <button onClick={openExisting}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-left group">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-600 transition-colors">
              <ListChecks size={22} className="text-purple-600 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-800 text-sm">Assign an Existing Property</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Pick from properties already in the system that don't have an owner yet.
              </p>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-purple-500 transition-colors" />
          </button>

          <div className="flex justify-end pt-2">
            <button type="button" onClick={onFinish}
              className="px-5 py-2 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold transition-colors">
              {addedCount > 0 ? 'Done' : 'Skip for now'}
            </button>
          </div>
        </div>
      )}

      {/* ── Add new property form ── */}
      {mode === 'new' && (
        <form onSubmit={handleAddProperty} className="space-y-4">
          <button type="button" onClick={() => { setMode(null); setPropError(''); setPropErrors({}) }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <ArrowLeft size={12} /> Back
          </button>

          {propError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{propError}</div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Listed for? *</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'rent', label: 'For Rent', icon: Home },
                { value: 'sale', label: 'For Sale', icon: Tag },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => setPurpose(opt.value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    propForm.purpose === opt.value
                      ? opt.value === 'rent' ? 'border-blue-500 bg-blue-50' : 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <opt.icon size={18} className={propForm.purpose === opt.value
                    ? opt.value === 'rent' ? 'text-blue-600' : 'text-amber-600'
                    : 'text-slate-400'} />
                  <p className="font-semibold text-sm text-slate-800">{opt.label}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Property Name *</label>
              <input required value={propForm.name} onChange={e => setPropForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Borrowdale Cottage"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <FieldError errors={propErrors} field="name" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Street Address *</label>
              <input required value={propForm.address} onChange={e => setPropForm(f => ({ ...f, address: e.target.value }))}
                placeholder="e.g. 14 Borrowdale Road"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <FieldError errors={propErrors} field="address" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">City *</label>
              <input required value={propForm.city} onChange={e => setPropForm(f => ({ ...f, city: e.target.value }))}
                placeholder="e.g. Harare"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <FieldError errors={propErrors} field="city" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Property Type</label>
              <select value={propForm.property_type} onChange={e => setPropForm(f => ({ ...f, property_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
                <option value="land">Land / Stand</option>
                <option value="mixed">Mixed Use</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Bedrooms</label>
              <input type="number" min="0" value={propForm.bedrooms}
                onChange={e => setPropForm(f => ({ ...f, bedrooms: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <FieldError errors={propErrors} field="bedrooms" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Bathrooms</label>
              <input type="number" min="0" step="0.5" value={propForm.bathrooms}
                onChange={e => setPropForm(f => ({ ...f, bathrooms: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <FieldError errors={propErrors} field="bathrooms" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Floor Area (m², optional)</label>
              <input type="number" min="0" step="0.01" value={propForm.square_feet}
                onChange={e => setPropForm(f => ({ ...f, square_feet: e.target.value }))}
                placeholder="e.g. 250"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <FieldError errors={propErrors} field="square_feet" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Year Built (optional)</label>
              <input type="number" min="0" value={propForm.year_built}
                onChange={e => setPropForm(f => ({ ...f, year_built: e.target.value }))}
                placeholder="e.g. 2008"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <FieldError errors={propErrors} field="year_built" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {propForm.purpose === 'rent' ? 'Monthly Rent (USD) *' : 'Asking Price (USD) *'}
              </label>
              <input required type="number" step="0.01" min="0"
                value={propForm.purpose === 'rent' ? propForm.monthly_rent : propForm.current_value}
                onChange={e => setPropForm(f => ({
                  ...f, [propForm.purpose === 'rent' ? 'monthly_rent' : 'current_value']: e.target.value,
                }))}
                placeholder={propForm.purpose === 'rent' ? 'e.g. 800' : 'e.g. 185000'}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <FieldError errors={propErrors} field={propForm.purpose === 'rent' ? 'monthly_rent' : 'current_value'} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setMode(null); setPropError(''); setPropErrors({}) }}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button type="submit" disabled={savingProperty}
              className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-semibold transition-colors">
              {savingProperty ? 'Adding…' : 'Add Property'}
            </button>
          </div>
        </form>
      )}

      {/* ── Assign existing unowned property ── */}
      {mode === 'existing' && (
        <div className="space-y-4">
          <button type="button" onClick={() => setMode(null)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <ArrowLeft size={12} /> Back
          </button>

          {loadingUnowned ? (
            <div className="py-10 text-center text-slate-400 text-sm">Loading unowned properties…</div>
          ) : unowned.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Building2 size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">No unowned properties available</p>
              <p className="text-xs mt-1">Every property already has a landlord. Try adding a new one instead.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Select properties with no owner to assign to {landlord.first_name || landlord.username}.
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {unowned.map(p => (
                  <label key={p.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedIds.includes(p.id) ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'
                    }`}>
                    <input type="checkbox" checked={selectedIds.includes(p.id)}
                      onChange={() => toggleSelected(p.id)} className="text-purple-600" />
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Building2 size={14} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 truncate">{p.address}, {p.city}</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{p.property_type}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMode(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                  Cancel
                </button>
                <button type="button" onClick={handleAssign} disabled={assigning || selectedIds.length === 0}
                  className="px-5 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 font-semibold transition-colors">
                  {assigning ? 'Assigning…' : `Assign ${selectedIds.length || ''} Propert${selectedIds.length === 1 ? 'y' : 'ies'}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────
function EditProfileModal({ user, onClose, onSaved, toast }) {
  const [form, setForm] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    phone: user.phone || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch(`/users/${user.id}/`, form)
      toast('Profile updated', 'success')
      onSaved()
    } catch (err) {
      toast(err?.response?.data?.detail || 'Update failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Edit Profile — ${user.first_name || user.username}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name</label>
            <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name</label>
            <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+263 77 000 0000"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-semibold">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Change Role Modal ─────────────────────────────────────────────────────────
function ChangeRoleModal({ user, currentUser, onClose, onSaved, toast }) {
  const [newRole, setNewRole] = useState(user.role)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newRole === user.role) { onClose(); return }
    setSaving(true)
    try {
      await api.post(`/users/${user.id}/change_role/`, { role: newRole })
      toast(`${user.first_name || user.username}'s role changed to ${roleLabel(newRole)}`, 'success')
      onSaved()
    } catch (err) {
      toast(err?.response?.data?.error || 'Role change failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Change Role — ${user.first_name || user.username}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-3 text-sm flex items-center gap-3">
          <span className="text-slate-500 text-xs">Current role:</span>
          <RolePill role={user.role} />
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {[...STAFF_ROLES, ...CLIENT_ROLES].map(r => (
            <label key={r.value}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                newRole === r.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}>
              <input type="radio" name="role" value={r.value}
                checked={newRole === r.value} onChange={() => setNewRole(r.value)}
                className="text-blue-600" />
              <div className={`w-7 h-7 rounded-lg ${r.color} flex items-center justify-center flex-shrink-0`}>
                <r.icon size={13} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{r.label}</p>
                <p className="text-xs text-slate-400 truncate">{r.desc}</p>
              </div>
            </label>
          ))}
        </div>
        {user.id === currentUser?.id && newRole !== 'admin' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            Warning: Removing your own admin role will lock you out of user management.
          </div>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || newRole === user.role}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 font-semibold">
            {saving ? 'Saving…' : 'Apply Change'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose, toast }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newPassword !== confirm) { toast('Passwords do not match', 'error'); return }
    setSaving(true)
    try {
      await api.post(`/users/${user.id}/reset_password/`, { new_password: newPassword })
      toast(`Password for ${user.first_name || user.username} has been reset`, 'success')
      onClose()
    } catch (err) {
      toast(err?.response?.data?.error || 'Reset failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Reset Password — ${user.first_name || user.username}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
          This will immediately change the password for <strong>{user.first_name || user.username}</strong>.
          Communicate the new password to them securely.
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">New Password *</label>
          <input required type="password" value={newPassword}
            onChange={e => setNewPassword(e.target.value)} minLength={8}
            autoComplete="new-password" placeholder="min. 8 characters"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm Password *</label>
          <input required type="password" value={confirm}
            onChange={e => setConfirm(e.target.value)} minLength={8}
            autoComplete="new-password" placeholder="repeat password"
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
              confirm && confirm !== newPassword ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-500'
            }`} />
          {confirm && confirm !== newPassword && (
            <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || !newPassword || newPassword !== confirm}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 font-semibold">
            {saving ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
