import { useState, useEffect } from 'react'
import { Plus, AlertTriangle, Clock, Pencil, Trash2, FileText } from 'lucide-react'
import { leasesAPI, propertiesAPI, usersAPI } from '../services/api'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'

const TABS = ['Active Leases', 'All Leases', 'Expiring Soon', 'Clause Library']

const LEASE_STATUSES = ['draft', 'active', 'expired', 'terminated', 'renewal_pending']

const CLAUSE_CATEGORIES = [
  { value: 'payment',     label: 'Payment Terms' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'pets',        label: 'Pet Policy' },
  { value: 'subletting',  label: 'Subletting' },
  { value: 'termination', label: 'Termination' },
  { value: 'utilities',   label: 'Utilities' },
  { value: 'general',     label: 'General' },
]

const fmtDate     = (d) => d ? new Date(d).toLocaleDateString('en-ZW') : '—'
const fmtCurrency = (v) => v != null ? `$${Number(v).toLocaleString()}` : '—'
const daysUntil   = (dateStr) => {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

const emptyLeaseForm = {
  property: '', unit: '', tenant: '',
  start_date: '', end_date: '',
  monthly_rent: '', security_deposit: '',
  status: 'active',
}

export default function LeasesPage() {
  const [tab, setTab] = useState('Active Leases')
  const [leases, setLeases] = useState([])
  const [allLeases, setAllLeases] = useState([])
  const [expiring, setExpiring] = useState([])
  const [clauses, setClauses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Dropdowns for create/edit form
  const [properties, setProperties] = useState([])
  const [units, setUnits] = useState([])
  const [tenants, setTenants] = useState([])

  // Create / Edit Lease
  const [leaseModal, setLeaseModal] = useState(false)
  const [editLease, setEditLease] = useState(null)
  const [leaseForm, setLeaseForm] = useState(emptyLeaseForm)
  const [savingLease, setSavingLease] = useState(false)
  const [leaseError, setLeaseError] = useState('')
  const [loadingUnits, setLoadingUnits] = useState(false)

  // Renew
  const [renewModal, setRenewModal] = useState(false)
  const [selectedLease, setSelectedLease] = useState(null)
  const [renewForm, setRenewForm] = useState({ new_end_date: '', new_monthly_rent: '', notes: '' })
  const [renewing, setRenewing] = useState(false)

  // Clause
  const [clauseModal, setClauseModal] = useState(false)
  const [clauseForm, setClauseForm] = useState({ title: '', category: 'general', content: '' })
  const [savingClause, setSavingClause] = useState(false)

  // ── Data loading ────────────────────────────────────────────────────────────
  const fetchActive = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await leasesAPI.list({ status: 'active' })
      setLeases(Array.isArray(data) ? data : data.results ?? [])
    } catch {
      setError('Failed to load leases.')
    } finally {
      setLoading(false)
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    try {
      const { data } = await leasesAPI.list({})
      setAllLeases(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
    finally { setLoading(false) }
  }

  const fetchExpiring = async () => {
    try {
      const { data } = await leasesAPI.expiringSoon(60)
      setExpiring(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchClauses = async () => {
    try {
      const { data } = await leasesAPI.clauses.list()
      setClauses(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  useEffect(() => { fetchActive() }, [])

  useEffect(() => {
    if (tab === 'All Leases')     fetchAll()
    if (tab === 'Expiring Soon')  fetchExpiring()
    if (tab === 'Clause Library') fetchClauses()
  }, [tab])

  // Load dropdowns when modal opens
  useEffect(() => {
    if (!leaseModal) return
    propertiesAPI.list({ page_size: 200 })
      .then(r => setProperties(r.data?.results ?? r.data ?? []))
      .catch(() => {})
    usersAPI.list({ role: 'tenant', page_size: 200 })
      .then(r => setTenants(r.data?.results ?? r.data ?? []))
      .catch(() => {
        // fallback: try /users/tenants/
        usersAPI.tenants()
          .then(r2 => setTenants(r2.data?.results ?? r2.data ?? []))
          .catch(() => {})
      })
  }, [leaseModal])

  const handlePropertyChange = async (propertyId) => {
    setLeaseForm(f => ({ ...f, property: propertyId, unit: '' }))
    setUnits([])
    if (!propertyId) return
    setLoadingUnits(true)
    try {
      const r = await propertiesAPI.units(propertyId)
      setUnits(r.data?.results ?? r.data ?? [])
    } catch { setUnits([]) }
    finally { setLoadingUnits(false) }
  }

  // ── Create / Edit lease ──────────────────────────────────────────────────────
  const openCreate = () => {
    setEditLease(null)
    setLeaseForm(emptyLeaseForm)
    setLeaseError('')
    setLeaseModal(true)
  }

  const openEdit = async (lease) => {
    setEditLease(lease)
    setLeaseForm({
      property:          lease.property ?? '',
      unit:              lease.unit ?? '',
      tenant:            lease.tenant ?? '',
      start_date:        lease.start_date ?? '',
      end_date:          lease.end_date ?? '',
      monthly_rent:      lease.monthly_rent ?? '',
      security_deposit:  lease.security_deposit ?? '',
      status:            lease.status ?? 'active',
    })
    setLeaseError('')
    // Pre-load units for the existing property
    if (lease.property) {
      setLoadingUnits(true)
      try {
        const r = await propertiesAPI.units(lease.property)
        setUnits(r.data?.results ?? r.data ?? [])
      } catch { setUnits([]) }
      finally { setLoadingUnits(false) }
    } else {
      setUnits([])
    }
    setLeaseModal(true)
  }

  const handleLeaseSubmit = async (e) => {
    e.preventDefault()
    if (leaseForm.start_date && leaseForm.end_date && leaseForm.end_date <= leaseForm.start_date) {
      setLeaseError('End date must be after start date.')
      return
    }
    setSavingLease(true)
    setLeaseError('')
    try {
      const payload = { ...leaseForm }
      // Remove empty optional fields
      if (!payload.unit) delete payload.unit
      if (!payload.security_deposit) delete payload.security_deposit
      if (editLease) {
        await leasesAPI.update(editLease.id, payload)
      } else {
        await leasesAPI.create(payload)
      }
      setLeaseModal(false)
      fetchActive()
      if (tab === 'All Leases') fetchAll()
    } catch (err) {
      const data = err?.response?.data
      setLeaseError(
        typeof data === 'string' ? data
        : data?.detail ?? Object.entries(data ?? {}).map(([k, v]) => `${k}: ${v}`).join(' | ')
        ?? 'Failed to save lease.'
      )
    } finally {
      setSavingLease(false)
    }
  }

  const handleDelete = async (lease) => {
    const name = `${lease.tenant_name ?? 'Tenant'} – ${lease.property_name ?? 'Property'}`
    if (!window.confirm(`Delete lease for "${name}"? This cannot be undone.`)) return
    try {
      await leasesAPI.delete(lease.id)
      fetchActive()
      if (tab === 'All Leases') fetchAll()
    } catch {
      alert('Failed to delete lease. It may have linked records.')
    }
  }

  // ── Renew ────────────────────────────────────────────────────────────────────
  const handleRenew = async (e) => {
    e.preventDefault()
    setRenewing(true)
    try {
      await leasesAPI.initiateRenewal(selectedLease.id, renewForm)
      setRenewModal(false)
      fetchActive()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to initiate renewal.')
    } finally {
      setRenewing(false)
    }
  }

  // ── Clause ───────────────────────────────────────────────────────────────────
  const handleAddClause = async (e) => {
    e.preventDefault()
    setSavingClause(true)
    try {
      await leasesAPI.clauses.create(clauseForm)
      setClauseModal(false)
      setClauseForm({ title: '', category: 'general', content: '' })
      fetchClauses()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to add clause.')
    } finally {
      setSavingClause(false)
    }
  }

  // ── Table columns ─────────────────────────────────────────────────────────────
  const actionCol = {
    key: 'id', label: 'Actions',
    render: (v, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openEdit(row)}
          title="Edit"
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          <Pencil size={13} />
        </button>
        <button onClick={() => { setSelectedLease(row); setRenewForm({ new_end_date: '', new_monthly_rent: '', notes: '' }); setRenewModal(true) }}
          title="Renew"
          className="text-[11px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">
          Renew
        </button>
        <button onClick={() => handleDelete(row)}
          title="Delete"
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    )
  }

  const leaseColumns = [
    { key: 'tenant_name',   label: 'Tenant',   render: (v, row) => v ?? row.tenant ?? '—' },
    { key: 'property_name', label: 'Property', render: (v, row) => v ?? row.property ?? '—' },
    { key: 'unit',          label: 'Unit',     render: (v, row) => row.unit_number ?? (v ? `#${v}` : '—') },
    { key: 'start_date',    label: 'Start',    render: (v) => fmtDate(v) },
    { key: 'end_date',      label: 'End',      render: (v) => fmtDate(v) },
    { key: 'monthly_rent',  label: 'Rent',     render: (v) => fmtCurrency(v) },
    { key: 'status',        label: 'Status',   render: (v) => <Badge value={v} /> },
    {
      key: 'end_date', label: 'Days Left',
      render: (v) => {
        const d = daysUntil(v)
        if (d === null) return '—'
        return (
          <span className={d < 0 ? 'text-red-600 font-medium' : d < 30 ? 'text-orange-600 font-medium' : d < 60 ? 'text-yellow-600' : 'text-slate-600'}>
            {d < 0 ? `${Math.abs(d)}d ago` : `${d}d`}
          </span>
        )
      }
    },
    actionCol,
  ]

  const groupedClauses = clauses.reduce((acc, c) => {
    const cat = c.category ?? 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(c)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Leases</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage tenant lease agreements</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
          <Plus size={16} /> Add Lease
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Active Leases ── */}
      {tab === 'Active Leases' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <Table columns={leaseColumns} data={leases} loading={loading} emptyMessage="No active leases." />
        </div>
      )}

      {/* ── All Leases ── */}
      {tab === 'All Leases' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <Table columns={leaseColumns} data={allLeases} loading={loading} emptyMessage="No leases found." />
        </div>
      )}

      {/* ── Expiring Soon ── */}
      {tab === 'Expiring Soon' && (
        <div className="space-y-3">
          {expiring.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-400">
              <Clock size={36} className="mx-auto mb-3 opacity-30" />
              <p>No leases expiring in the next 60 days.</p>
            </div>
          ) : (
            expiring.map((lease) => {
              const days = daysUntil(lease.end_date)
              return (
                <div key={lease.id} className={`bg-white rounded-xl border shadow-sm p-5 flex items-start gap-4 ${
                  days < 30 ? 'border-red-200' : 'border-amber-200'
                }`}>
                  <div className={`p-2.5 rounded-lg ${days < 30 ? 'bg-red-50' : 'bg-amber-50'}`}>
                    <AlertTriangle size={18} className={days < 30 ? 'text-red-500' : 'text-amber-500'} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-800 text-sm">
                        {lease.tenant_name ?? lease.tenant} — {lease.property_name ?? lease.property}
                      </p>
                      <span className={`text-xs font-semibold ${days < 30 ? 'text-red-600' : 'text-amber-600'}`}>
                        {days}d remaining
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Expires: {fmtDate(lease.end_date)} · Rent: {fmtCurrency(lease.monthly_rent)}/mo
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(lease)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                      <Pencil size={11} /> Edit
                    </button>
                    <button onClick={() => { setSelectedLease(lease); setRenewForm({ new_end_date: '', new_monthly_rent: '', notes: '' }); setRenewModal(true) }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                      Renew
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Clause Library ── */}
      {tab === 'Clause Library' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setClauseModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              <Plus size={15} /> Add Clause
            </button>
          </div>
          {Object.keys(groupedClauses).length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-400">
              <FileText size={36} className="mx-auto mb-3 opacity-30" />
              <p>No clauses in library. Add common clauses to reuse across leases.</p>
            </div>
          ) : (
            Object.entries(groupedClauses).map(([cat, items]) => {
              const label = CLAUSE_CATEGORIES.find(c => c.value === cat)?.label ?? cat
              return (
                <div key={cat} className="mb-6">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{label}</h2>
                  <div className="space-y-2">
                    {items.map((c) => (
                      <div key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                        <p className="font-medium text-slate-800 text-sm mb-1">{c.title}</p>
                        <p className="text-xs text-slate-500 line-clamp-2">{c.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Create / Edit Lease Modal ── */}
      <Modal open={leaseModal} onClose={() => { setLeaseModal(false); setEditLease(null) }}
        title={editLease ? 'Edit Lease' : 'New Lease Agreement'} size="lg">
        <form onSubmit={handleLeaseSubmit} className="space-y-4">
          {leaseError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">{leaseError}</div>
          )}

          {/* Property + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Property *</label>
              <select required value={leaseForm.property}
                onChange={e => handlePropertyChange(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select property —</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Unit {loadingUnits ? '(loading…)' : '(optional)'}
              </label>
              <select value={leaseForm.unit}
                onChange={e => setLeaseForm(f => ({ ...f, unit: e.target.value }))}
                disabled={!leaseForm.property || loadingUnits}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                <option value="">— All / General —</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.unit_number}{u.floor ? ` (Floor ${u.floor})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tenant */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tenant *</label>
            <select required value={leaseForm.tenant}
              onChange={e => setLeaseForm(f => ({ ...f, tenant: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Select tenant —</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>
                  {t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.username}
                  {t.email ? ` (${t.email})` : ''}
                </option>
              ))}
            </select>
            {tenants.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">No tenant accounts found. Add a Tenant user first via User Management.</p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Start Date *</label>
              <input required type="date" value={leaseForm.start_date}
                onChange={e => setLeaseForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">End Date *</label>
              <input required type="date" value={leaseForm.end_date}
                onChange={e => setLeaseForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Financials */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Monthly Rent (USD) *</label>
              <input required type="number" step="0.01" min="0" value={leaseForm.monthly_rent}
                onChange={e => setLeaseForm(f => ({ ...f, monthly_rent: e.target.value }))}
                placeholder="e.g. 600"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Security Deposit (USD)</label>
              <input type="number" step="0.01" min="0" value={leaseForm.security_deposit}
                onChange={e => setLeaseForm(f => ({ ...f, security_deposit: e.target.value }))}
                placeholder="e.g. 1200"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
            <select value={leaseForm.status}
              onChange={e => setLeaseForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {LEASE_STATUSES.map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setLeaseModal(false); setEditLease(null) }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={savingLease}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {savingLease ? 'Saving…' : editLease ? 'Save Changes' : 'Create Lease'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Renewal Modal ── */}
      <Modal open={renewModal} onClose={() => setRenewModal(false)} title="Initiate Lease Renewal" size="sm">
        <form onSubmit={handleRenew} className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p className="text-slate-500">Tenant: <strong className="text-slate-800">{selectedLease?.tenant_name ?? selectedLease?.tenant}</strong></p>
            <p className="text-slate-500 mt-0.5">Current end: <strong className="text-slate-800">{fmtDate(selectedLease?.end_date)}</strong></p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">New End Date *</label>
            <input required type="date" value={renewForm.new_end_date}
              onChange={(e) => setRenewForm({ ...renewForm, new_end_date: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">New Monthly Rent (USD)</label>
            <input type="number" step="0.01" value={renewForm.new_monthly_rent}
              placeholder={selectedLease?.monthly_rent}
              onChange={(e) => setRenewForm({ ...renewForm, new_monthly_rent: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <textarea rows={2} value={renewForm.notes}
              onChange={(e) => setRenewForm({ ...renewForm, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setRenewModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={renewing}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {renewing ? 'Submitting…' : 'Initiate Renewal'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Add Clause Modal ── */}
      <Modal open={clauseModal} onClose={() => setClauseModal(false)} title="Add Lease Clause" size="sm">
        <form onSubmit={handleAddClause} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title *</label>
            <input required value={clauseForm.title}
              onChange={(e) => setClauseForm({ ...clauseForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category</label>
            <select value={clauseForm.category}
              onChange={(e) => setClauseForm({ ...clauseForm, category: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {CLAUSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Content *</label>
            <textarea required rows={5} value={clauseForm.content}
              onChange={(e) => setClauseForm({ ...clauseForm, content: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setClauseModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={savingClause}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {savingClause ? 'Saving…' : 'Add Clause'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
