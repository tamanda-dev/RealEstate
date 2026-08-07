import { useState, useEffect } from 'react'
import {
  Building2, DollarSign, Eye, Tag, TrendingUp, BarChart2,
  CheckCircle, ArrowRight, FileText, Receipt, UserCog, Plus, Home,
} from 'lucide-react'
import { propertiesAPI, rentAPI, salesAPI, reportsAPI, usersAPI } from '../services/api'
import { portalAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Badge from '../components/Badge'
import StatCard from '../components/StatCard'
import Table from '../components/Table'
import Modal from '../components/Modal'

const fmtUSD = (v) => v != null ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const TABS = ['My Portfolio', 'Rental Statements', 'Invoices', 'Offers Received', 'Listing Performance', 'Account Details']
const currentYear = new Date().getFullYear()

const PROPERTY_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'land', label: 'Land / Stand' },
  { value: 'mixed', label: 'Mixed Use' },
]
const RENT_STATUSES = ['available', 'rented', 'under_maintenance']
const SALE_STATUSES = ['listed_for_sale', 'sold', 'under_maintenance']

const emptyPropertyForm = {
  purpose: 'rent',
  name: '', address: '', city: 'Harare', state: '', country: 'Zimbabwe',
  property_type: 'residential',
  status: 'available',
  bedrooms: '', bathrooms: '', square_feet: '', year_built: '',
  monthly_rent: '',
  current_value: '',
  description: '',
}

export default function SellerPortalPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState('My Portfolio')

  const [properties, setProperties] = useState([])
  const [listings, setListings] = useState([])
  const [offers, setOffers] = useState([])
  const [rentStats, setRentStats] = useState(null)
  const [loading, setLoading] = useState(true)

  // ── Add Property ──
  const [showAddProperty, setShowAddProperty] = useState(false)
  const [propForm, setPropForm] = useState(emptyPropertyForm)
  const [savingProperty, setSavingProperty] = useState(false)
  const [propFormError, setPropFormError] = useState('')

  const openAddProperty = () => {
    setPropForm(emptyPropertyForm)
    setPropFormError('')
    setShowAddProperty(true)
  }

  const setPropertyPurpose = (purpose) => {
    setPropForm(f => ({
      ...f,
      purpose,
      status: purpose === 'rent' ? 'available' : 'listed_for_sale',
      monthly_rent: '',
      current_value: '',
    }))
  }

  const handleAddProperty = async (e) => {
    e.preventDefault()
    setSavingProperty(true)
    setPropFormError('')
    try {
      const { purpose, ...payload } = propForm
      if (purpose === 'rent') delete payload.current_value
      if (purpose === 'sale') delete payload.monthly_rent
      payload.owner = user?.id
      await propertiesAPI.create(payload)
      toast('Property added', 'success')
      setShowAddProperty(false)
      setPropForm(emptyPropertyForm)
      loadAll()
    } catch (err) {
      const data = err?.response?.data
      setPropFormError(
        typeof data === 'string' ? data
        : data?.detail ?? Object.entries(data ?? {}).map(([k, v]) => `${k}: ${v}`).join(' | ')
        ?? 'Failed to add property.'
      )
    } finally {
      setSavingProperty(false)
    }
  }

  const propertyStatusOptions = propForm.purpose === 'rent' ? RENT_STATUSES : SALE_STATUSES

  const loadAll = async () => {
    setLoading(true)
    try {
      const [propsRes, listRes, offersRes, rentRes] = await Promise.allSettled([
        propertiesAPI.list({ owner: user?.id }),
        salesAPI.listings.list(),
        portalAPI.buyerOffers.list(),
        rentAPI.invoices.stats(),
      ])
      if (propsRes.status === 'fulfilled') {
        const d = propsRes.value.data
        setProperties(Array.isArray(d) ? d : d.results ?? [])
      }
      if (listRes.status === 'fulfilled') {
        const d = listRes.value.data
        setListings(Array.isArray(d) ? d : d.results ?? [])
      }
      if (offersRes.status === 'fulfilled') {
        const d = offersRes.value.data
        setOffers(Array.isArray(d) ? d : d.results ?? [])
      }
      if (rentRes.status === 'fulfilled') setRentStats(rentRes.value.data)
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // ── Rental Statements ──
  const [statementYear, setStatementYear] = useState(currentYear)
  const [statement, setStatement] = useState(null)
  const [statementLoading, setStatementLoading] = useState(false)

  const loadStatement = async () => {
    if (!user?.id) return
    setStatementLoading(true)
    try {
      const { data } = await reportsAPI.landlordLedger(user.id, statementYear)
      setStatement(data)
    } catch {
      toast('Failed to load rental statement', 'error')
    } finally {
      setStatementLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'Rental Statements') loadStatement()
  }, [tab, statementYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Invoices ──
  const [invoices, setInvoices] = useState([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)

  const loadInvoices = async () => {
    setInvoicesLoading(true)
    try {
      const { data } = await rentAPI.invoices.list()
      setInvoices(Array.isArray(data) ? data : data.results ?? [])
    } catch {
      toast('Failed to load invoices', 'error')
    } finally {
      setInvoicesLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'Invoices') loadInvoices()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Account Details ──
  const [accountForm, setAccountForm] = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [savingAccount, setSavingAccount] = useState(false)

  useEffect(() => {
    if (tab === 'Account Details' && user) {
      setAccountForm({
        first_name: user.first_name || '', last_name: user.last_name || '',
        email: user.email || '', phone: user.phone || '',
      })
    }
  }, [tab, user])

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setSavingAccount(true)
    try {
      await usersAPI.updateMe(accountForm)
      toast('Account details updated', 'success')
    } catch (err) {
      toast(err?.response?.data?.detail ?? 'Failed to update account details', 'error')
    } finally {
      setSavingAccount(false)
    }
  }

  const invoiceColumns = [
    { key: 'invoice_number', label: 'Invoice #', render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: 'property_name', label: 'Property' },
    { key: 'tenant_name', label: 'Tenant' },
    { key: 'due_date', label: 'Due Date', render: (v) => fmtDate(v) },
    { key: 'total_amount', label: 'Amount', render: (v) => fmtUSD(v) },
    { key: 'paid_amount', label: 'Paid', render: (v) => fmtUSD(v) },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
  ]

  const handleReviewOffer = async (offer) => {
    try {
      await portalAPI.buyerOffers.review(offer.id)
      toast('Offer marked as under review', 'success')
      loadAll()
    } catch { toast('Failed', 'error') }
  }

  const totalPortfolioValue = properties.reduce((s, p) => s + Number(p.current_value || 0), 0)
  const rentedCount = properties.filter(p => p.status === 'rented').length
  const forSaleCount = properties.filter(p => p.status === 'listed_for_sale').length
  const pendingOffers = offers.filter(o => o.status === 'submitted').length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Seller / Landlord Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Track your property portfolio, offers, and rental income.
          </p>
        </div>
        <button onClick={openAddProperty}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm shrink-0">
          <Plus size={16} /> Add Property
        </button>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="animate-pulse bg-slate-100 rounded-xl h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Building2} label="Total Properties" value={properties.length} color="blue" />
          <StatCard icon={TrendingUp} label="Portfolio Value" value={fmtUSD(totalPortfolioValue)} color="purple" />
          <StatCard icon={DollarSign} label="Rented" value={rentedCount} color="green" />
          <StatCard icon={Eye} label="For Sale" value={forSaleCount} color="amber" />
          <StatCard icon={Tag} label="Pending Offers" value={pendingOffers} color={pendingOffers > 0 ? 'red' : 'slate'} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t}
            {t === 'Offers Received' && pendingOffers > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                {pendingOffers}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── My Portfolio ── */}
      {tab === 'My Portfolio' && (
        <div className="space-y-4">
          {properties.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Building2 size={40} className="mx-auto mb-2 opacity-30" />
              <p>No properties linked to your account</p>
            </div>
          ) : (
            properties.map(p => {
              const rentPerSqm = p.monthly_rent && p.square_feet
                ? (Number(p.monthly_rent) / Number(p.square_feet)).toFixed(2) : null
              return (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800">{p.name}</h3>
                        <Badge value={p.status} />
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{p.address}, {p.city}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">Current Value</p>
                      <p className="text-xl font-bold text-slate-800">{fmtUSD(p.current_value)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500">Monthly Rent</p>
                      <p className="font-bold text-slate-800">{fmtUSD(p.monthly_rent)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500">Rent / m²</p>
                      <p className="font-bold text-blue-600">{rentPerSqm ? `$${rentPerSqm}` : '—'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500">Floor Area</p>
                      <p className="font-bold text-slate-800">{p.square_feet ? `${p.square_feet}m²` : '—'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500">Type</p>
                      <p className="font-bold text-slate-800 capitalize">{p.property_type}</p>
                    </div>
                  </div>

                  {rentStats && p.status === 'rented' && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                      <CheckCircle size={14} />
                      Rent is being collected — see the "Rental Statements" tab for disbursement details.
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Rental Statements ── */}
      {tab === 'Rental Statements' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <label className="text-sm font-medium text-slate-600">Year</label>
            <select value={statementYear} onChange={(e) => setStatementYear(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {statementLoading ? (
            <div className="animate-pulse bg-slate-100 rounded-xl h-40" />
          ) : statement ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard icon={TrendingUp} label="Annual Gross Rent" value={fmtUSD(statement.annual_gross_rent)} color="blue" />
                <StatCard icon={DollarSign} label="Annual Net Disbursed" value={fmtUSD(statement.annual_net_disbursed)} color="green" />
                <StatCard icon={Receipt} label="Deductions (Commission/VAT)" value={fmtUSD(statement.annual_deductions)} color="amber" />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-sm">Monthly Breakdown — {statementYear}</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr><th className="text-left px-4 py-2">Month</th><th className="text-right px-4 py-2">Gross Rent</th><th className="text-right px-4 py-2">Net Disbursed</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(statement.monthly ?? []).map((m) => (
                      <tr key={m.month}>
                        <td className="px-4 py-2">{m.month}</td>
                        <td className="px-4 py-2 text-right">{fmtUSD(m.gross_rent)}</td>
                        <td className="px-4 py-2 text-right font-medium text-green-700">{fmtUSD(m.net_disbursed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <FileText size={40} className="mx-auto mb-2 opacity-30" />
              <p>No statement data for {statementYear}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Invoices ── */}
      {tab === 'Invoices' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table columns={invoiceColumns} data={invoices} loading={invoicesLoading} emptyMessage="No invoices found for your properties." />
        </div>
      )}

      {/* ── Offers Received ── */}
      {tab === 'Offers Received' && (
        <div className="space-y-3">
          {offers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Tag size={40} className="mx-auto mb-2 opacity-30" />
              <p>No offers received yet</p>
            </div>
          ) : (
            offers.map(o => (
              <div key={o.id}
                className={`bg-white rounded-xl border p-5 ${
                  o.status === 'submitted' ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'
                }`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">
                      {o.listing_summary?.property_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Offer from: {o.buyer_name} · {fmtDate(o.created_at)}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-2xl font-bold text-blue-600">{fmtUSD(o.offer_amount_usd)}</p>
                      {o.listing_summary?.asking_price && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          Number(o.offer_amount_usd) >= Number(o.listing_summary.asking_price)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {Number(o.offer_amount_usd) >= Number(o.listing_summary.asking_price)
                            ? 'At or above asking'
                            : `${((Number(o.listing_summary.asking_price) - Number(o.offer_amount_usd)) / Number(o.listing_summary.asking_price) * 100).toFixed(1)}% below asking`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      {o.is_cash_buyer && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Cash Buyer</span>}
                      {o.finance_pre_approved && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Finance Pre-approved</span>}
                      {o.proposed_closing_date && <span>Closing: {fmtDate(o.proposed_closing_date)}</span>}
                    </div>
                    {o.conditions && (
                      <p className="text-xs text-slate-500 mt-1 italic">Conditions: {o.conditions}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge value={o.status} />
                    {o.status === 'submitted' && (
                      <button onClick={() => handleReviewOffer(o)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                        <ArrowRight size={12} /> Review
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Listing Performance ── */}
      {tab === 'Listing Performance' && (
        <div className="space-y-3">
          {listings.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <BarChart2 size={40} className="mx-auto mb-2 opacity-30" />
              <p>No listings found</p>
            </div>
          ) : (
            listings.map(l => (
              <div key={l.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-800">{l.property_name}</h3>
                    <p className="text-sm text-slate-500">Asking: {fmtUSD(l.asking_price)}</p>
                  </div>
                  <Badge value={l.status} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-800">{l.views_count ?? 0}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Views</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-800">{l.offer_count ?? 0}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Offers</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-800">{l.days_on_market ?? 0}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Days on Market</p>
                  </div>
                </div>
                {l.listing_date && (
                  <p className="text-xs text-slate-400 mt-3">Listed: {fmtDate(l.listing_date)}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Account Details ── */}
      {tab === 'Account Details' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg">
          <div className="flex items-center gap-2 mb-4">
            <UserCog size={18} className="text-slate-400" />
            <h3 className="font-semibold text-slate-800">My Account Details</h3>
          </div>
          <form onSubmit={handleSaveAccount} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name</label>
                <input type="text" value={accountForm.first_name}
                  onChange={(e) => setAccountForm((f) => ({ ...f, first_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name</label>
                <input type="text" value={accountForm.last_name}
                  onChange={(e) => setAccountForm((f) => ({ ...f, last_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
              <input type="email" value={accountForm.email}
                onChange={(e) => setAccountForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <input type="text" value={accountForm.phone}
                onChange={(e) => setAccountForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Username</label>
              <input type="text" value={user?.username ?? ''} disabled
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400" />
            </div>
            <button type="submit" disabled={savingAccount}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {savingAccount ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {/* ── Add Property Modal ── */}
      <Modal open={showAddProperty} onClose={() => { setShowAddProperty(false); setPropFormError('') }}
        title="Add Property" size="lg">
        <form onSubmit={handleAddProperty} className="space-y-5">
          {propFormError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{propFormError}</div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">What is this property listed for? *</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'rent', label: 'For Rent', icon: Home, desc: 'Tenant will pay monthly rent' },
                { value: 'sale', label: 'For Sale', icon: Tag, desc: 'Property is on the market to sell' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setPropertyPurpose(opt.value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    propForm.purpose === opt.value
                      ? opt.value === 'rent' ? 'border-blue-500 bg-blue-50' : 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <opt.icon size={20} className={propForm.purpose === opt.value
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

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Location</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Property Name *</label>
                <input required value={propForm.name} onChange={e => setPropForm({ ...propForm, name: e.target.value })}
                  placeholder="e.g. Borrowdale Cottage, CBD Office Block A"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Street Address *</label>
                <input required value={propForm.address} onChange={e => setPropForm({ ...propForm, address: e.target.value })}
                  placeholder="e.g. 14 Borrowdale Road, Borrowdale"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City *</label>
                <input required value={propForm.city} onChange={e => setPropForm({ ...propForm, city: e.target.value })}
                  placeholder="e.g. Harare"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Province</label>
                <input value={propForm.state} onChange={e => setPropForm({ ...propForm, state: e.target.value })}
                  placeholder="e.g. Mashonaland East"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Property Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Property Type *</label>
                <select required value={propForm.property_type} onChange={e => setPropForm({ ...propForm, property_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select value={propForm.status} onChange={e => setPropForm({ ...propForm, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {propertyStatusOptions.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bedrooms</label>
                <input type="number" min="0" value={propForm.bedrooms}
                  onChange={e => setPropForm({ ...propForm, bedrooms: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bathrooms</label>
                <input type="number" min="0" step="0.5" value={propForm.bathrooms}
                  onChange={e => setPropForm({ ...propForm, bathrooms: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Floor Area (m²)</label>
                <input type="number" step="0.01" value={propForm.square_feet}
                  onChange={e => setPropForm({ ...propForm, square_feet: e.target.value })}
                  placeholder="e.g. 250"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Year Built</label>
                <input type="number" value={propForm.year_built}
                  onChange={e => setPropForm({ ...propForm, year_built: e.target.value })}
                  placeholder="e.g. 2008"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className={`rounded-xl border-2 p-4 ${propForm.purpose === 'rent' ? 'border-blue-200 bg-blue-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
            {propForm.purpose === 'rent' ? (
              <div>
                <p className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                  <Home size={15} /> Rental Pricing
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Rent (USD) *</label>
                  <input required type="number" step="0.01" min="0" value={propForm.monthly_rent}
                    onChange={e => setPropForm({ ...propForm, monthly_rent: e.target.value })}
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
                  <input required type="number" step="0.01" min="0" value={propForm.current_value}
                    onChange={e => setPropForm({ ...propForm, current_value: e.target.value })}
                    placeholder="e.g. 185000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white" />
                  <p className="text-xs text-slate-400 mt-1">The listed selling price in USD.</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea rows={3} value={propForm.description}
              onChange={e => setPropForm({ ...propForm, description: e.target.value })}
              placeholder="Describe the property — features, location notes, fixtures, borehole, solar, security..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowAddProperty(false); setPropFormError('') }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={savingProperty}
              className={`px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 transition-colors ${
                propForm.purpose === 'rent' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}>
              {savingProperty ? 'Saving...' : `Add ${propForm.purpose === 'rent' ? 'Rental' : 'Sale'} Property`}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
