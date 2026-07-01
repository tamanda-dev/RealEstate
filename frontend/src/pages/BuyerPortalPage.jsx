import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Heart, Eye, Tag, MapPin, Bed, Bath, Square,
  DollarSign, Plus, Star, CheckCircle, Clock, X, Calendar,
} from 'lucide-react'
import { salesAPI, portalAPI, currencyAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import Badge from '../components/Badge'

const TABS = ['Browse Listings', 'My Favourites', 'My Viewings', 'My Offers']

const fmtUSD = (v) => v != null ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'

function ListingCard({ listing, saved, onSave, onUnsave, onRequestViewing }) {
  const prop = listing.property_name || '—'
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group">
      {/* Image placeholder */}
      <div className="h-40 bg-gradient-to-br from-slate-100 to-slate-200 relative flex items-center justify-center">
        <MapPin size={32} className="text-slate-300" />
        <div className="absolute top-3 right-3 flex gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            listing.status === 'active' ? 'bg-green-500 text-white' : 'bg-slate-500 text-white'
          }`}>{listing.status}</span>
        </div>
        <button
          onClick={() => saved ? onUnsave(listing) : onSave(listing)}
          className={`absolute top-3 left-3 p-2 rounded-full transition-all ${
            saved ? 'bg-red-500 text-white' : 'bg-white/80 text-slate-400 hover:text-red-500'
          }`}
          title={saved ? 'Remove from favourites' : 'Save to favourites'}
        >
          <Heart size={16} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-slate-800 text-sm truncate">{prop}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{listing.property_city || ''}</p>

        <p className="text-xl font-bold text-blue-600 mt-2">{fmtUSD(listing.asking_price)}</p>

        <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
          {listing.property_bedrooms > 0 && (
            <span className="flex items-center gap-1"><Bed size={12} /> {listing.property_bedrooms} bed</span>
          )}
          {listing.property_bathrooms > 0 && (
            <span className="flex items-center gap-1"><Bath size={12} /> {listing.property_bathrooms} bath</span>
          )}
          {listing.property_sqft > 0 && (
            <span className="flex items-center gap-1"><Square size={12} /> {listing.property_sqft}m²</span>
          )}
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onRequestViewing(listing)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Eye size={13} /> Request Viewing
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BuyerPortalPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState('Browse Listings')

  // Listings
  const [listings, setListings] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [savedListings, setSavedListings] = useState([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [loadingListings, setLoadingListings] = useState(true)

  // Viewings
  const [viewings, setViewings] = useState([])
  const [showViewingModal, setShowViewingModal] = useState(null)
  const [viewingForm, setViewingForm] = useState({ preferred_dates: '', buyer_notes: '' })

  // Offers
  const [myOffers, setMyOffers] = useState([])
  const [showOfferModal, setShowOfferModal] = useState(null)
  const [offerForm, setOfferForm] = useState({
    offer_amount_usd: '', is_cash_buyer: false, finance_pre_approved: false,
    proposed_closing_date: '', conditions: '',
  })

  // Exchange rate
  const [zigRate, setZigRate] = useState(null)

  useEffect(() => {
    loadListings()
    loadFavourites()
    loadViewings()
    loadMyOffers()
    currencyAPI.latest().then(({ data }) => setZigRate(data.usd_to_zig)).catch(() => {})
  }, [])

  const loadListings = async () => {
    setLoadingListings(true)
    try {
      const { data } = await salesAPI.listings.list({ status: 'active' })
      setListings(Array.isArray(data) ? data : data.results ?? [])
    } catch { } finally { setLoadingListings(false) }
  }

  const loadFavourites = async () => {
    try {
      const { data } = await portalAPI.savedListings.myFavourites()
      const items = Array.isArray(data) ? data : data.results ?? []
      setSavedListings(items)
      setSavedIds(new Set(items.map(s => s.listing)))
    } catch { }
  }

  const loadViewings = async () => {
    try {
      const { data } = await portalAPI.viewings.list()
      setViewings(Array.isArray(data) ? data : data.results ?? [])
    } catch { }
  }

  const loadMyOffers = async () => {
    try {
      const { data } = await portalAPI.buyerOffers.list()
      setMyOffers(Array.isArray(data) ? data : data.results ?? [])
    } catch { }
  }

  const handleSave = async (listing) => {
    try {
      await portalAPI.savedListings.save(listing.id, '')
      setSavedIds(prev => new Set([...prev, listing.id]))
      toast('Added to favourites', 'success')
      loadFavourites()
    } catch { toast('Could not save', 'error') }
  }

  const handleUnsave = async (listing) => {
    const saved = savedListings.find(s => s.listing === listing.id)
    if (!saved) return
    try {
      await portalAPI.savedListings.remove(saved.id)
      setSavedIds(prev => { const n = new Set(prev); n.delete(listing.id); return n })
      toast('Removed from favourites', 'info')
      loadFavourites()
    } catch { toast('Could not remove', 'error') }
  }

  const submitViewing = async () => {
    try {
      await portalAPI.viewings.create({ listing: showViewingModal.id, ...viewingForm })
      toast('Viewing request submitted! An agent will confirm shortly.', 'success')
      setShowViewingModal(null)
      setViewingForm({ preferred_dates: '', buyer_notes: '' })
      loadViewings()
    } catch { toast('Failed to submit viewing request', 'error') }
  }

  const submitOffer = async () => {
    try {
      await portalAPI.buyerOffers.create({ listing: showOfferModal.id, ...offerForm })
      toast('Offer submitted successfully!', 'success')
      setShowOfferModal(null)
      loadMyOffers()
    } catch (err) {
      toast(err?.response?.data?.detail || 'Failed to submit offer', 'error')
    }
  }

  const filteredListings = listings.filter(l => {
    const matchSearch = !search ||
      l.property_name?.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome, {user?.first_name || user?.username}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Browse properties, save favourites, and manage your viewings & offers.
        </p>
        {zigRate && (
          <p className="text-xs text-slate-400 mt-1">
            Today's rate: 1 USD = {zigRate} ZiG
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t}
            {t === 'My Favourites' && savedIds.size > 0 && (
              <span className="ml-1.5 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full font-bold">
                {savedIds.size}
              </span>
            )}
            {t === 'My Viewings' && viewings.length > 0 && (
              <span className="ml-1.5 bg-blue-100 text-blue-600 text-xs px-1.5 py-0.5 rounded-full font-bold">
                {viewings.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Browse Listings ── */}
      {tab === 'Browse Listings' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by property name…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {loadingListings ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <div key={i} className="animate-pulse bg-slate-100 rounded-xl h-64" />)}
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Search size={40} className="mx-auto mb-2 opacity-30" />
              <p>No active listings found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredListings.map(l => (
                <ListingCard
                  key={l.id} listing={l}
                  saved={savedIds.has(l.id)}
                  onSave={handleSave} onUnsave={handleUnsave}
                  onRequestViewing={setShowViewingModal}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── My Favourites ── */}
      {tab === 'My Favourites' && (
        <div className="space-y-4">
          {savedListings.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Heart size={40} className="mx-auto mb-2 opacity-30" />
              <p>No saved listings yet</p>
              <button onClick={() => setTab('Browse Listings')} className="mt-3 text-blue-600 hover:underline text-sm">
                Browse listings →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedListings.map(s => (
                <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-800">{s.listing_summary?.property_name}</p>
                      <p className="text-lg font-bold text-blue-600 mt-1">
                        {fmtUSD(s.listing_summary?.asking_price)}
                      </p>
                      <Badge value={s.listing_summary?.status} />
                    </div>
                    <button onClick={() => handleUnsave({ id: s.listing })}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <X size={15} />
                    </button>
                  </div>
                  {s.notes && <p className="text-xs text-slate-400 mt-2">{s.notes}</p>}
                  <button
                    onClick={() => setShowViewingModal({ id: s.listing, property_name: s.listing_summary?.property_name })}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors"
                  >
                    <Eye size={13} /> Request Viewing
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── My Viewings ── */}
      {tab === 'My Viewings' && (
        <div className="space-y-3">
          {viewings.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Eye size={40} className="mx-auto mb-2 opacity-30" />
              <p>No viewing requests yet</p>
            </div>
          ) : (
            viewings.map(v => (
              <div key={v.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  v.status === 'scheduled' ? 'bg-blue-100' :
                  v.status === 'completed' ? 'bg-green-100' : 'bg-slate-100'
                }`}>
                  {v.status === 'completed' ? <CheckCircle size={18} className="text-green-600" /> :
                   v.status === 'scheduled' ? <Calendar size={18} className="text-blue-600" /> :
                   <Clock size={18} className="text-slate-400" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{v.listing_summary?.property_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Agent: {v.agent_name || 'Pending assignment'}
                  </p>
                  {v.confirmed_datetime && (
                    <p className="text-xs text-blue-600 mt-1 font-medium">
                      Confirmed: {new Date(v.confirmed_datetime).toLocaleString('en-ZW')}
                    </p>
                  )}
                  {v.preferred_dates && !v.confirmed_datetime && (
                    <p className="text-xs text-slate-400 mt-1">Preferred: {v.preferred_dates}</p>
                  )}
                  {v.feedback && (
                    <div className="mt-2 bg-slate-50 rounded p-2 text-xs text-slate-600">
                      Feedback: {v.feedback}
                      {v.rating && <span className="ml-2 text-amber-500">{'★'.repeat(v.rating)}</span>}
                    </div>
                  )}
                </div>
                <Badge value={v.status} />
              </div>
            ))
          )}
        </div>
      )}

      {/* ── My Offers ── */}
      {tab === 'My Offers' && (
        <div className="space-y-3">
          {myOffers.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Tag size={40} className="mx-auto mb-2 opacity-30" />
              <p>No offers submitted yet</p>
              <button onClick={() => setTab('Browse Listings')} className="mt-3 text-blue-600 hover:underline text-sm">
                Browse listings to make an offer →
              </button>
            </div>
          ) : (
            myOffers.map(o => (
              <div key={o.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{o.listing_summary?.property_name}</p>
                    <p className="text-lg font-bold text-blue-600">{fmtUSD(o.offer_amount_usd)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {o.is_cash_buyer ? 'Cash buyer' : o.finance_pre_approved ? 'Finance pre-approved' : 'Finance pending'}
                      {o.proposed_closing_date && ` · Closing: ${o.proposed_closing_date}`}
                    </p>
                  </div>
                  <Badge value={o.status} />
                </div>
                {o.rejection_reason && (
                  <div className="mt-2 bg-red-50 border border-red-100 rounded p-2 text-xs text-red-600">
                    Reason: {o.rejection_reason}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Request Viewing Modal */}
      <Modal open={!!showViewingModal} onClose={() => setShowViewingModal(null)}
        title={`Request Viewing — ${showViewingModal?.property_name || ''}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Preferred Dates / Times *
            </label>
            <textarea rows={3} value={viewingForm.preferred_dates}
              onChange={e => setViewingForm(f => ({ ...f, preferred_dates: e.target.value }))}
              placeholder="e.g. Weekday mornings, Saturday 10am-12pm, Any day after 5pm"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes for Agent</label>
            <textarea rows={2} value={viewingForm.buyer_notes}
              onChange={e => setViewingForm(f => ({ ...f, buyer_notes: e.target.value }))}
              placeholder="Anything specific you want to check during the viewing?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowViewingModal(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={submitViewing} disabled={!viewingForm.preferred_dates}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-medium">
              Submit Request
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
