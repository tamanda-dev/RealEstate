import { useState, useEffect } from 'react'
import { Plus, AlertTriangle, Building2, DollarSign } from 'lucide-react'
import { salesAPI } from '../services/api'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'

const TABS = ['Listings', 'CRM Contacts', 'Offers', 'Commission Calculator']

export default function SalesPage() {
  const [tab, setTab] = useState('Listings')
  const [listings, setListings] = useState([])
  const [contacts, setContacts] = useState([])
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Commission calculator
  const [salePrice, setSalePrice] = useState('')
  const [structure, setStructure] = useState('standard_5')
  const [commResult, setCommResult] = useState(null)
  const [calculating, setCalculating] = useState(false)

  // Modals
  const [contactModal, setContactModal] = useState(false)
  const [contactForm, setContactForm] = useState({ first_name: '', last_name: '', email: '', phone: '', contact_type: 'buyer', budget_min: '', budget_max: '' })
  const [savingContact, setSavingContact] = useState(false)

  const [counterModal, setCounterModal] = useState(false)
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [counterForm, setCounterForm] = useState({ counter_amount: '', notes: '' })
  const [counterSaving, setCounterSaving] = useState(false)

  const fetchListings = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await salesAPI.listings.list()
      setListings(Array.isArray(data) ? data : data.results ?? [])
    } catch {
      setError('Failed to load listings.')
    } finally {
      setLoading(false)
    }
  }

  const fetchContacts = async () => {
    try {
      const { data } = await salesAPI.contacts.list()
      setContacts(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchOffers = async () => {
    try {
      const { data } = await salesAPI.offers.list()
      setOffers(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  useEffect(() => { fetchListings() }, [])
  useEffect(() => {
    if (tab === 'CRM Contacts') fetchContacts()
    if (tab === 'Offers') fetchOffers()
  }, [tab])

  const handleAcceptOffer = async (id) => {
    if (!window.confirm('Accept this offer?')) return
    try {
      await salesAPI.offers.accept(id)
      fetchOffers()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to accept offer.')
    }
  }

  const handleCounter = async (e) => {
    e.preventDefault()
    setCounterSaving(true)
    try {
      await salesAPI.offers.counter(selectedOffer.id, counterForm)
      setCounterModal(false)
      fetchOffers()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to send counter.')
    } finally {
      setCounterSaving(false)
    }
  }

  const handleAddContact = async (e) => {
    e.preventDefault()
    setSavingContact(true)
    try {
      await salesAPI.contacts.create(contactForm)
      setContactModal(false)
      setContactForm({ first_name: '', last_name: '', email: '', phone: '', contact_type: 'buyer', budget_min: '', budget_max: '' })
      fetchContacts()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to add contact.')
    } finally {
      setSavingContact(false)
    }
  }

  const handleLinkUser = async (contact) => {
    try {
      const { data } = await salesAPI.contacts.linkUser(contact.id)
      alert(`Linked to platform user "${data.user_username}" — their portal activity and KYC now resolve to this same contact.`)
      fetchContacts()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'No matching platform account found for this contact\'s email.')
    }
  }

  const handleCalculate = async () => {
    if (!salePrice) return
    setCalculating(true)
    try {
      const { data } = await salesAPI.commissions.calculate({ sale_price: salePrice, structure })
      setCommResult(data)
    } catch {
      // Fallback client-side calculation
      const price = parseFloat(salePrice)
      const rates = { standard_5: 0.05, standard_6: 0.06, split_3_2: 0.05, flat_fee: 0 }
      const rate = rates[structure] ?? 0.05
      const total = price * rate
      setCommResult({ total_commission: total, listing_agent: total * 0.5, buyer_agent: total * 0.5, broker_split: total * 0.1 })
    } finally {
      setCalculating(false)
    }
  }

  const fmtCurrency = (v) => v != null ? `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—'
  const daysOnMarket = (d) => d ? Math.floor((new Date() - new Date(d)) / 86400000) : '—'

  const contactColumns = [
    { key: 'contact_type', label: 'Type', render: (v) => <Badge value={v} /> },
    { key: 'first_name', label: 'Name', render: (v, row) => `${v ?? ''} ${row.last_name ?? ''}`.trim() || '—' },
    { key: 'email', label: 'Email', render: (v) => v ?? '—' },
    { key: 'phone', label: 'Phone', render: (v) => v ?? '—' },
    { key: 'status', label: 'Status', render: (v) => v ? <Badge value={v} /> : '—' },
    {
      key: 'budget_min', label: 'Budget',
      render: (v, row) => `${fmtCurrency(v)} – ${fmtCurrency(row.budget_max)}`
    },
    {
      key: 'id', label: 'Platform Account',
      render: (v, row) => row.user_username ? (
        <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">@{row.user_username}</span>
      ) : (
        <button onClick={() => handleLinkUser(row)}
          className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">
          Link User Account
        </button>
      )
    },
  ]

  const offerColumns = [
    { key: 'listing_address', label: 'Listing', render: (v, row) => v ?? row.listing ?? '—' },
    { key: 'buyer_name', label: 'Buyer', render: (v, row) => v ?? row.buyer ?? '—' },
    { key: 'offer_amount', label: 'Amount', render: (v) => fmtCurrency(v) },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'offer_date', label: 'Date', render: (v) => fmtDate(v) },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => row.status === 'pending' ? (
        <div className="flex gap-1.5">
          <button onClick={() => handleAcceptOffer(v)}
            className="text-xs px-2 py-1 rounded-md bg-green-600 text-white hover:bg-green-700">Accept</button>
          <button onClick={() => { setSelectedOffer(row); setCounterForm({ counter_amount: '', notes: '' }); setCounterModal(true) }}
            className="text-xs px-2 py-1 rounded-md bg-yellow-500 text-white hover:bg-yellow-600">Counter</button>
        </div>
      ) : '—'
    },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales & CRM</h1>
          <p className="text-gray-500 text-sm mt-0.5">Listings, contacts, offers & commissions</p>
        </div>
        {tab === 'CRM Contacts' && (
          <button onClick={() => setContactModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Add Contact
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Listings */}
      {tab === 'Listings' && (
        loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>No active listings.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {listings.map((l) => (
              <div key={l.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Building2 size={20} className="text-blue-600" />
                  </div>
                  <Badge value={l.status} />
                </div>
                <h3 className="font-semibold text-gray-800 text-sm mb-1 line-clamp-2">
                  {l.property_name ?? l.address ?? `Listing #${l.id}`}
                </h3>
                <p className="text-xs text-gray-500 mb-3">{l.address ?? '—'}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-gray-800 text-base">{fmtCurrency(l.asking_price)}</span>
                  <span className="text-xs text-gray-400">{daysOnMarket(l.list_date)}d on market</span>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs text-gray-500">
                  <span>{l.offer_count ?? 0} offer{l.offer_count !== 1 ? 's' : ''}</span>
                  <span>Listed {fmtDate(l.list_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* CRM Contacts */}
      {tab === 'CRM Contacts' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table columns={contactColumns} data={contacts} loading={false} emptyMessage="No contacts found." />
        </div>
      )}

      {/* Offers */}
      {tab === 'Offers' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table columns={offerColumns} data={offers} loading={false} emptyMessage="No offers found." />
        </div>
      )}

      {/* Commission Calculator */}
      {tab === 'Commission Calculator' && (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5 flex items-center gap-2">
              <DollarSign size={18} className="text-blue-600" /> Commission Calculator
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sale Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="500000"
                    className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commission Structure</label>
                <select value={structure} onChange={(e) => setStructure(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="standard_5">Standard 5%</option>
                  <option value="standard_6">Standard 6%</option>
                  <option value="split_3_2">Split 3/2%</option>
                  <option value="flat_fee">Flat Fee</option>
                </select>
              </div>
              <button onClick={handleCalculate} disabled={calculating || !salePrice}
                className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {calculating ? 'Calculating...' : 'Calculate Commission'}
              </button>
            </div>

            {commResult && (
              <div className="mt-6 pt-5 border-t border-gray-100 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Breakdown</h3>
                {[
                  { label: 'Total Commission', value: commResult.total_commission, bold: true },
                  { label: 'Listing Agent', value: commResult.listing_agent },
                  { label: "Buyer's Agent", value: commResult.buyer_agent },
                  { label: 'Broker Split', value: commResult.broker_split },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className={`text-sm ${row.bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{row.label}</span>
                    <span className={`text-sm ${row.bold ? 'font-bold text-blue-700 text-base' : 'text-gray-700'}`}>
                      {fmtCurrency(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact Modal */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title="Add CRM Contact" size="lg">
        <form onSubmit={handleAddContact} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input required value={contactForm.first_name} onChange={(e) => setContactForm({ ...contactForm, first_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input value={contactForm.last_name} onChange={(e) => setContactForm({ ...contactForm, last_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={contactForm.contact_type} onChange={(e) => setContactForm({ ...contactForm, contact_type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {['buyer', 'seller', 'investor', 'tenant'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget Min</label>
              <input type="number" value={contactForm.budget_min} onChange={(e) => setContactForm({ ...contactForm, budget_min: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget Max</label>
              <input type="number" value={contactForm.budget_max} onChange={(e) => setContactForm({ ...contactForm, budget_max: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setContactModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingContact}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {savingContact ? 'Saving...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Counter Offer Modal */}
      <Modal open={counterModal} onClose={() => setCounterModal(false)} title="Counter Offer">
        <form onSubmit={handleCounter} className="space-y-4">
          <p className="text-sm text-gray-500">
            Original offer: <strong>{fmtCurrency(selectedOffer?.offer_amount)}</strong>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Counter Amount *</label>
            <input required type="number" step="0.01" value={counterForm.counter_amount}
              onChange={(e) => setCounterForm({ ...counterForm, counter_amount: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={2} value={counterForm.notes}
              onChange={(e) => setCounterForm({ ...counterForm, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setCounterModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={counterSaving}
              className="px-4 py-2 rounded-lg bg-yellow-500 text-white text-sm font-medium hover:bg-yellow-600 disabled:opacity-60">
              {counterSaving ? 'Sending...' : 'Send Counter'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
