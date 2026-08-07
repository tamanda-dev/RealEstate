import { useState, useEffect, useCallback } from 'react'
import { Plus, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import StatCard from '../components/StatCard'
import { bookingsAPI, currencyAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

export default function ReservationsPage() {
  const { toast } = useToast()
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [expiring, setExpiring] = useState([])
  const [rate, setRate] = useState(13.7)

  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(null)

  const [form, setForm] = useState({
    property: '', contact: '', deal_type: 'sale',
    token_amount: '', currency: 'USD', valid_until: '', notes: '',
  })
  const [confirmForm, setConfirmForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    method: 'cash', reference: '',
  })

  useEffect(() => {
    currencyAPI.latest().then(({ data }) => {
      if (data?.rate) setRate(parseFloat(data.rate))
    }).catch(() => {})
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [resRes, expRes] = await Promise.all([
        bookingsAPI.reservations.list(),
        bookingsAPI.reservations.expiringSoon(),
      ])
      setReservations(resRes.data?.results ?? resRes.data ?? [])
      setExpiring(expRes.data?.results ?? expRes.data ?? [])
    } catch {
      toast('Failed to load reservations', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadData() }, [loadData])

  const handleCreate = async () => {
    try {
      await bookingsAPI.reservations.create(form)
      toast('Reservation created', 'success')
      setShowNew(false)
      setForm({ property: '', contact: '', deal_type: 'sale', token_amount: '', currency: 'USD', valid_until: '', notes: '' })
      loadData()
    } catch {
      toast('Failed to create reservation', 'error')
    }
  }

  const handleConfirm = async () => {
    if (!showConfirm) return
    try {
      await bookingsAPI.reservations.confirm(showConfirm.id, confirmForm)
      toast('Payment confirmed', 'success')
      setShowConfirm(null)
      loadData()
    } catch {
      toast('Failed to confirm payment', 'error')
    }
  }

  const columns = [
    { key: 'reservation_number', label: 'Reservation #', render: (v, row) => (
      <span className="font-mono text-sm text-blue-600">{v ?? row.reference ?? `RES-${row.id}`}</span>
    )},
    { key: 'property_name', label: 'Property', render: (v, row) => (
      <span className="text-sm">{v ?? row.property_display ?? '—'}</span>
    )},
    { key: 'contact_name', label: 'Contact / Lead', render: (v, row) => (
      <span className="text-sm">{v ?? row.lead_name ?? '—'}</span>
    )},
    { key: 'deal_type', label: 'Deal Type', render: (v) => (
      <span className="text-xs px-2 py-1 bg-slate-100 rounded-full capitalize">{v}</span>
    )},
    { key: 'token_amount', label: 'Token (USD)', render: (v) => (
      <div>
        <p className="text-sm font-semibold">${fmt(v)}</p>
        {v && <p className="text-xs text-slate-400">ZiG {(parseFloat(v) * rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>}
      </div>
    )},
    { key: 'payment_method', label: 'Payment', render: (v) => (
      <span className="text-sm capitalize text-slate-600">{v || '—'}</span>
    )},
    { key: 'valid_until', label: 'Valid Until', render: (v) => {
      if (!v) return <span className="text-slate-400">—</span>
      const days = daysUntil(v)
      return (
        <div>
          <p className={`text-sm font-medium ${days !== null && days <= 3 ? 'text-red-600' : 'text-slate-700'}`}>
            {new Date(v).toLocaleDateString()}
          </p>
          {days !== null && days <= 3 && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle size={10} /> {days <= 0 ? 'Expired' : `${days}d left`}
            </p>
          )}
        </div>
      )
    }},
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'actions', label: 'Actions', render: (_, row) => (
      <button onClick={() => setShowConfirm(row)}
        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
        <CheckCircle size={12} /> Confirm
      </button>
    )},
  ]

  const expiring3 = expiring.filter(r => {
    const d = daysUntil(r.valid_until)
    return d !== null && d <= 3
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reservations & Bookings</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage property token payments and reservations</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus size={16} /> New Reservation
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="Total" value={reservations.length} color="blue" />
        <StatCard icon={AlertTriangle} label="Expiring Soon" value={expiring3.length} color="red" />
        <StatCard icon={CheckCircle} label="Confirmed" value={reservations.filter(r => r.status === 'confirmed').length} color="green" />
        <StatCard icon={Clock} label="Pending" value={reservations.filter(r => r.status === 'pending').length} color="yellow" />
      </div>

      {/* Expiring Alert */}
      {expiring3.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Reservations Expiring Soon</p>
            <p className="text-sm text-red-600 mt-0.5">
              {expiring3.length} reservation{expiring3.length !== 1 ? 's' : ''} expiring within 3 days:{' '}
              {expiring3.map(r => r.reservation_number ?? r.reference ?? `#${r.id}`).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table columns={columns} data={reservations} loading={loading} emptyMessage="No reservations found" />
      </div>

      {/* New Reservation Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Reservation" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Property</label>
              <input value={form.property} onChange={e => setForm(p => ({ ...p, property: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Property ID or name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contact / Lead</label>
              <input value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Contact ID or name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deal Type</label>
              <select value={form.deal_type} onChange={e => setForm(p => ({ ...p, deal_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="sale">Sale</option>
                <option value="lease">Lease</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Token Amount</label>
              <input type="number" value={form.token_amount} onChange={e => setForm(p => ({ ...p, token_amount: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="5000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
              <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valid Until</label>
              <input type="date" value={form.valid_until} onChange={e => setForm(p => ({ ...p, valid_until: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowNew(false)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleCreate}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Reservation</button>
          </div>
        </div>
      </Modal>

      {/* Confirm Payment Modal */}
      <Modal open={!!showConfirm} onClose={() => setShowConfirm(null)} title="Confirm Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Confirm token payment for reservation <strong>{showConfirm?.reservation_number ?? showConfirm?.reference}</strong></p>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment Date *</label>
            <input type="date" value={confirmForm.payment_date} onChange={e => setConfirmForm(p => ({ ...p, payment_date: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method *</label>
            <select value={confirmForm.method} onChange={e => setConfirmForm(p => ({ ...p, method: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="ecocash">EcoCash</option>
              <option value="innbucks">InnBucks</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Reference</label>
            <input value={confirmForm.reference} onChange={e => setConfirmForm(p => ({ ...p, reference: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Bank reference / receipt #" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowConfirm(null)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleConfirm}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              <CheckCircle size={14} /> Confirm Payment
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
