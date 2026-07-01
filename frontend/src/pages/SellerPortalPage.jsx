import { useState, useEffect } from 'react'
import {
  Building2, DollarSign, Eye, Tag, TrendingUp, BarChart2,
  CheckCircle, Clock, XCircle, ArrowRight,
} from 'lucide-react'
import { propertiesAPI, rentAPI, salesAPI } from '../services/api'
import { portalAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Badge from '../components/Badge'
import StatCard from '../components/StatCard'

const fmtUSD = (v) => v != null ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const TABS = ['My Portfolio', 'Offers Received', 'Listing Performance']

export default function SellerPortalPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState('My Portfolio')

  const [properties, setProperties] = useState([])
  const [listings, setListings] = useState([])
  const [offers, setOffers] = useState([])
  const [rentStats, setRentStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

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
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Seller / Landlord Dashboard
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Track your property portfolio, offers, and rental income.
        </p>
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
                      Rent is being collected. Contact your property manager for disbursement details.
                    </div>
                  )}
                </div>
              )
            })
          )}
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
    </div>
  )
}
