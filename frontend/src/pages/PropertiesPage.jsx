import { useState, useEffect } from 'react'
import { Search, Plus, Building2, AlertTriangle, Home, Tag, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { propertiesAPI } from '../services/api'
import Badge from '../components/Badge'
import Modal from '../components/Modal'

const PROPERTY_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'land', label: 'Land / Stand' },
  { value: 'mixed', label: 'Mixed Use' },
]

const RENT_STATUSES   = ['available', 'rented', 'under_maintenance']
const SALE_STATUSES   = ['listed_for_sale', 'sold', 'under_maintenance']
const ALL_STATUSES    = [
  { value: '',                  label: 'All Statuses' },
  { value: 'available',         label: 'Available (Rental)' },
  { value: 'rented',            label: 'Rented' },
  { value: 'listed_for_sale',   label: 'Listed for Sale' },
  { value: 'sold',              label: 'Sold' },
  { value: 'under_maintenance', label: 'Under Maintenance' },
]

const emptyForm = {
  purpose: 'rent',            // UI-only: drives which fields appear
  name: '', address: '', city: 'Harare', state: '', country: 'Zimbabwe',
  property_type: 'residential',
  status: 'available',
  bedrooms: '', bathrooms: '', square_feet: '', year_built: '',
  monthly_rent: '',           // only for rent
  current_value: '',          // only for sale (asking price)
  description: '',
}

const fmtUSD = (v) => v ? `$${Number(v).toLocaleString('en-US')}` : '—'

const isForSale = (status) => status === 'listed_for_sale' || status === 'sold'

export default function PropertiesPage() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editProp, setEditProp] = useState(null)   // null = add mode, object = edit mode
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchProperties = async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (search) params.search = search
      if (filterType) params.property_type = filterType
      if (filterStatus) params.status = filterStatus
      const { data } = await propertiesAPI.list(params)
      setProperties(Array.isArray(data) ? data : data.results ?? [])
    } catch {
      setError('Failed to load properties.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProperties() }, [search, filterType, filterStatus])

  // When purpose changes, auto-set a sensible status default
  const setPurpose = (purpose) => {
    setForm(f => ({
      ...f,
      purpose,
      status: purpose === 'rent' ? 'available' : 'listed_for_sale',
      monthly_rent: '',
      current_value: '',
    }))
  }

  const openAdd = () => {
    setEditProp(null)
    setForm(emptyForm)
    setFormError('')
    setShowAdd(true)
  }

  const openEdit = (p) => {
    const purpose = isForSale(p.status) ? 'sale' : 'rent'
    setForm({
      purpose,
      name: p.name ?? '', address: p.address ?? '', city: p.city ?? 'Harare',
      state: p.state ?? '', country: p.country ?? 'Zimbabwe',
      property_type: p.property_type ?? 'residential',
      status: p.status ?? 'available',
      bedrooms: p.bedrooms ?? '', bathrooms: p.bathrooms ?? '',
      square_feet: p.square_feet ?? '', year_built: p.year_built ?? '',
      monthly_rent: p.monthly_rent ?? '',
      current_value: p.current_value ?? '',
      description: p.description ?? '',
    })
    setEditProp(p)
    setFormError('')
    setShowAdd(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const { purpose, ...payload } = form
      if (purpose === 'rent') delete payload.current_value
      if (purpose === 'sale') delete payload.monthly_rent
      if (editProp) {
        await propertiesAPI.update(editProp.id, payload)
      } else {
        await propertiesAPI.create(payload)
      }
      setShowAdd(false)
      setForm(emptyForm)
      setEditProp(null)
      fetchProperties()
    } catch (err) {
      const data = err?.response?.data
      setFormError(
        typeof data === 'string' ? data
        : data?.detail ?? Object.entries(data ?? {}).map(([k, v]) => `${k}: ${v}`).join(' | ')
        ?? 'Failed to save property.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This action cannot be undone.`)) return
    try {
      await propertiesAPI.delete(p.id)
      fetchProperties()
    } catch {
      alert('Failed to delete property. It may have linked leases or records.')
    }
  }

  const statusOptions = form.purpose === 'rent' ? RENT_STATUSES : SALE_STATUSES

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Properties</h1>
          <p className="text-slate-500 text-sm mt-0.5">{properties.length} properties in portfolio</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
          <Plus size={16} /> Add Property
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search by name or address..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Types</option>
          {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          {ALL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="h-36 bg-slate-100" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-slate-100 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Building2 size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No properties found.</p>
          <p className="text-sm mt-1">Add your first property to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {properties.map((p) => {
            const forSale = isForSale(p.status)
            return (
              <div key={p.id}
                className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                {/* Purpose stripe */}
                <div className={`h-1.5 ${forSale ? 'bg-amber-500' : 'bg-blue-500'}`} />
                {/* Image placeholder */}
                <div className="h-32 bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center gap-1">
                  <Building2 size={28} className="text-slate-300" />
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    forSale ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {forSale ? 'FOR SALE' : 'FOR RENT'}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">{p.name}</h3>
                    <Badge value={p.status} />
                  </div>
                  <p className="text-xs text-slate-500 mb-3 line-clamp-1">{p.address}{p.city ? `, ${p.city}` : ''}</p>

                  {/* Specs row */}
                  <div className="flex gap-3 text-xs text-slate-500 mb-3">
                    <Badge value={p.property_type} />
                    {p.bedrooms > 0 && <span>{p.bedrooms} bd</span>}
                    {p.bathrooms > 0 && <span>{p.bathrooms} ba</span>}
                    {p.square_feet > 0 && <span>{p.square_feet}m²</span>}
                  </div>

                  {/* Price */}
                  <div className={`rounded-lg px-3 py-2 mb-3 ${forSale ? 'bg-amber-50' : 'bg-blue-50'}`}>
                    <p className={`text-[10px] font-medium uppercase tracking-wide ${forSale ? 'text-amber-600' : 'text-blue-600'}`}>
                      {forSale ? 'Asking Price' : 'Monthly Rent'}
                    </p>
                    <p className={`text-base font-bold ${forSale ? 'text-amber-700' : 'text-blue-700'}`}>
                      {forSale
                        ? fmtUSD(p.current_value)
                        : p.monthly_rent ? `${fmtUSD(p.monthly_rent)}/mo` : '—'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link to={`/properties/${p.id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-colors">
                      <ExternalLink size={12} /> View
                    </Link>
                    <button onClick={() => openEdit(p)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition-colors">
                      <Pencil size={12} /> Edit
                    </button>
                    <button onClick={() => handleDelete(p)}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add / Edit Property Modal ── */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setFormError(''); setEditProp(null) }}
        title={editProp ? `Edit Property — ${editProp.name}` : 'Add Property'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{formError}</div>
          )}

          {/* ── Step 1: Purpose ── */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">What is this property listed for? *</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'rent', label: 'For Rent', icon: Home, desc: 'Tenant will pay monthly rent' },
                { value: 'sale', label: 'For Sale', icon: Tag, desc: 'Property is on the market to sell' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setPurpose(opt.value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    form.purpose === opt.value
                      ? opt.value === 'rent'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <opt.icon size={20} className={form.purpose === opt.value
                    ? opt.value === 'rent' ? 'text-blue-600' : 'text-amber-600'
                    : 'text-slate-400'} />
                  <div>
                    <p className="font-semibold text-sm text-slate-800">{opt.label}</p>
                    <p className="text-[11px] text-slate-500">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Step 2: Location ── */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Location</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Property Name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Borrowdale Cottage, CBD Office Block A"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Street Address *</label>
                <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  placeholder="e.g. 14 Borrowdale Road, Borrowdale"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City *</label>
                <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                  placeholder="e.g. Harare"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Province</label>
                <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                  placeholder="e.g. Mashonaland East"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* ── Step 3: Property Details ── */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Property Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Property Type *</label>
                <select required value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {statusOptions.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bedrooms</label>
                <input type="number" min="0" value={form.bedrooms}
                  onChange={e => setForm({ ...form, bedrooms: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bathrooms</label>
                <input type="number" min="0" step="0.5" value={form.bathrooms}
                  onChange={e => setForm({ ...form, bathrooms: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Floor Area (m²)</label>
                <input type="number" step="0.01" value={form.square_feet}
                  onChange={e => setForm({ ...form, square_feet: e.target.value })}
                  placeholder="e.g. 250"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Year Built</label>
                <input type="number" value={form.year_built}
                  onChange={e => setForm({ ...form, year_built: e.target.value })}
                  placeholder="e.g. 2008"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* ── Step 4: Pricing — context-aware ── */}
          <div className={`rounded-xl border-2 p-4 ${form.purpose === 'rent' ? 'border-blue-200 bg-blue-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
            {form.purpose === 'rent' ? (
              <div>
                <p className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                  <Home size={15} /> Rental Pricing
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Rent (USD) *</label>
                  <input required type="number" step="0.01" min="0" value={form.monthly_rent}
                    onChange={e => setForm({ ...form, monthly_rent: e.target.value })}
                    placeholder="e.g. 800"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  <p className="text-xs text-slate-400 mt-1">Amount the tenant pays each month in USD.</p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
                  <Tag size={15} /> Sale Pricing
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Asking Price (USD) *</label>
                  <input required type="number" step="0.01" min="0" value={form.current_value}
                    onChange={e => setForm({ ...form, current_value: e.target.value })}
                    placeholder="e.g. 185000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white" />
                  <p className="text-xs text-slate-400 mt-1">The listed selling price in USD.</p>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the property — features, location notes, fixtures, borehole, solar, security..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowAdd(false); setFormError(''); setEditProp(null) }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 transition-colors ${
                form.purpose === 'rent' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}>
              {saving ? 'Saving...' : editProp ? 'Save Changes' : `Add ${form.purpose === 'rent' ? 'Rental' : 'Sale'} Property`}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
