import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Calculator, Send } from 'lucide-react'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import { bookingsAPI, currencyAPI, propertiesAPI, salesAPI, crmAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

const TABS = ['Quotations', 'Price Calculator']

function fmt(n) {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const DEFAULT_CALC = {
  base_price: '',
  discount_amount: '',
  vat_rate: 15,
  stamp_duty: '',
  registration_fees: '',
  legal_fees: '',
  parking_cost: '',
  other_charges: '',
  notes: '',
}

export default function QuotationsPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('Quotations')
  const [quotations, setQuotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [rate, setRate] = useState(13.7)
  const [showNewQuotation, setShowNewQuotation] = useState(false)
  const [quoteForm, setQuoteForm] = useState({
    property: '', contactKind: 'contact', contact: '', lead: '', deal_type: 'sale',
    base_price_usd: '', notes: '',
  })
  const [properties, setProperties] = useState([])
  const [contacts, setContacts] = useState([])
  const [leads, setLeads] = useState([])

  // Calculator state
  const [calcProperty, setCalcProperty] = useState('')
  const [calc, setCalc] = useState(DEFAULT_CALC)
  const [calcResult, setCalcResult] = useState(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const debounceRef = useRef(null)

  const [sendModal, setSendModal] = useState(null)
  const [whatsappPhone, setWhatsappPhone] = useState('')

  useEffect(() => {
    currencyAPI.latest().then(({ data }) => {
      if (data?.usd_to_zig) setRate(parseFloat(data.usd_to_zig))
    }).catch(() => {})
  }, [])

  const loadQuotations = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await bookingsAPI.quotations.list()
      setQuotations(data?.results ?? data ?? [])
    } catch {
      toast('Failed to load quotations', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadQuotations() }, [loadQuotations])

  useEffect(() => {
    Promise.all([
      propertiesAPI.list({ page_size: 200 }),
      salesAPI.contacts.list({ page_size: 200 }),
      crmAPI.leads.list({ page_size: 200 }),
    ]).then(([pRes, cRes, lRes]) => {
      setProperties(Array.isArray(pRes.data) ? pRes.data : pRes.data?.results ?? [])
      setContacts(Array.isArray(cRes.data) ? cRes.data : cRes.data?.results ?? [])
      setLeads(Array.isArray(lRes.data) ? lRes.data : lRes.data?.results ?? [])
    }).catch(() => { /* dropdowns just stay empty if this fails */ })
  }, [])

  const openNewQuotation = () => {
    setQuoteForm({ property: '', contactKind: 'contact', contact: '', lead: '', deal_type: 'sale', base_price_usd: '', notes: '' })
    setShowNewQuotation(true)
  }

  // Live calculator
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!calc.base_price) { setCalcResult(null); return }
      setCalcLoading(true)
      try {
        const payload = {
          base_price: parseFloat(calc.base_price) || 0,
          discount_amount: parseFloat(calc.discount_amount) || 0,
          vat_rate: parseFloat(calc.vat_rate) || 0,
          stamp_duty: parseFloat(calc.stamp_duty) || 0,
          registration_fees: parseFloat(calc.registration_fees) || 0,
          legal_fees: parseFloat(calc.legal_fees) || 0,
          parking_cost: parseFloat(calc.parking_cost) || 0,
          other_charges: parseFloat(calc.other_charges) || 0,
        }
        const { data } = await bookingsAPI.quotations.calculate(payload)
        setCalcResult(data)
      } catch {
        // Fallback: compute client-side
        const base = parseFloat(calc.base_price) || 0
        const discount = parseFloat(calc.discount_amount) || 0
        const subtotal = base - discount
        const vat = subtotal * (parseFloat(calc.vat_rate) || 0) / 100
        const extra = (parseFloat(calc.stamp_duty) || 0)
          + (parseFloat(calc.registration_fees) || 0)
          + (parseFloat(calc.legal_fees) || 0)
          + (parseFloat(calc.parking_cost) || 0)
          + (parseFloat(calc.other_charges) || 0)
        const total = subtotal + vat + extra
        setCalcResult({
          base_price: base, discount_amount: discount, subtotal,
          vat_amount: vat, stamp_duty: parseFloat(calc.stamp_duty) || 0,
          registration_fees: parseFloat(calc.registration_fees) || 0,
          legal_fees: parseFloat(calc.legal_fees) || 0,
          parking_cost: parseFloat(calc.parking_cost) || 0,
          other_charges: parseFloat(calc.other_charges) || 0,
          total_usd: total,
        })
      } finally {
        setCalcLoading(false)
      }
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [calc])

  const handleSendWhatsApp = async () => {
    if (!sendModal) return
    try {
      await bookingsAPI.quotations.send(sendModal.id, { whatsapp_phone: whatsappPhone })
      toast('Quotation sent via WhatsApp', 'success')
      setSendModal(null)
      setWhatsappPhone('')
    } catch {
      toast('Failed to send quotation', 'error')
    }
  }

  const handleCreateQuotation = async () => {
    try {
      await bookingsAPI.quotations.create({
        property: quoteForm.property,
        contact: quoteForm.contactKind === 'contact' ? quoteForm.contact || null : null,
        lead: quoteForm.contactKind === 'lead' ? quoteForm.lead || null : null,
        deal_type: quoteForm.deal_type,
        base_price_usd: quoteForm.base_price_usd,
        notes: quoteForm.notes,
      })
      toast('Quotation created', 'success')
      setShowNewQuotation(false)
      loadQuotations()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      toast((Array.isArray(firstError) ? firstError[0] : firstError) ?? 'Failed to create quotation', 'error')
    }
  }

  const handleGenerateFromCalc = async () => {
    if (!calcResult) return
    if (!calcProperty) { toast('Select a property first', 'error'); return }
    try {
      await bookingsAPI.quotations.create({
        property: calcProperty,
        base_price_usd: calc.base_price,
        // subtotal/vat/total are computed server-side from these components in
        // Quotation.save() — not sent directly (total_usd is read-only anyway).
        discount_amount_usd: calc.discount_amount || 0,
        vat_rate: calc.vat_rate,
        stamp_duty_usd: calc.stamp_duty || 0,
        registration_fees_usd: calc.registration_fees || 0,
        legal_fees_usd: calc.legal_fees || 0,
        parking_cost_usd: calc.parking_cost || 0,
        other_charges_usd: calc.other_charges || 0,
        notes: calc.notes,
      })
      toast('Quotation generated and saved', 'success')
      loadQuotations()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      toast((Array.isArray(firstError) ? firstError[0] : firstError) ?? 'Failed to generate quotation', 'error')
    }
  }

  const columns = [
    { key: 'reference', label: 'Reference', render: (v) => <span className="font-mono text-sm text-blue-600">{v || '—'}</span> },
    { key: 'property_name', label: 'Property', render: (v, row) => <span className="text-sm">{v ?? row.property_display ?? '—'}</span> },
    { key: 'contact_name', label: 'Contact / Lead', render: (v, row) => <span className="text-sm">{v ?? row.lead_name ?? '—'}</span> },
    { key: 'deal_type', label: 'Deal Type', render: (v) => <span className="text-xs px-2 py-1 bg-slate-100 rounded-full capitalize">{v}</span> },
    { key: 'total_usd', label: 'Total (USD)', render: (v) => (
      <div>
        <p className="text-sm font-semibold">${fmt(v)}</p>
        <p className="text-xs text-slate-400">ZiG {v ? (parseFloat(v) * rate).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}</p>
      </div>
    )},
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'valid_until', label: 'Valid Until', render: (v) => (
      v ? <span className="text-sm text-slate-600">{new Date(v).toLocaleDateString()}</span> : <span className="text-slate-400">—</span>
    )},
    { key: 'actions', label: 'Actions', render: (_, row) => (
      <button onClick={() => setSendModal(row)}
        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
        <Send size={12} /> WhatsApp
      </button>
    )},
  ]

  const lineItems = calcResult ? [
    { label: 'Base Price', value: calcResult.base_price },
    { label: 'Discount', value: -(calcResult.discount_amount || 0), negative: true },
    { label: 'Subtotal', value: calcResult.subtotal, bold: true },
    { label: `VAT (${calc.vat_rate}%)`, value: calcResult.vat_amount },
    { label: 'Stamp Duty', value: calcResult.stamp_duty },
    { label: 'Registration Fees', value: calcResult.registration_fees },
    { label: 'Legal Fees', value: calcResult.legal_fees },
    { label: 'Parking Cost', value: calcResult.parking_cost },
    { label: 'Other Charges', value: calcResult.other_charges },
  ].filter(item => item.value) : []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quotations & Price Calculator</h1>
          <p className="text-slate-500 text-sm mt-0.5">Generate and manage property quotations</p>
        </div>
        <button onClick={openNewQuotation}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus size={16} /> New Quotation
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Quotations Tab */}
      {activeTab === 'Quotations' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table columns={columns} data={quotations} loading={loading} emptyMessage="No quotations yet" />
        </div>
      )}

      {/* Price Calculator Tab */}
      {activeTab === 'Price Calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Calculator size={16} /> Price Inputs
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Property *</label>
                <select value={calcProperty} onChange={e => setCalcProperty(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select property...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name ?? p.address}</option>
                  ))}
                </select>
              </div>
              {[
                { key: 'base_price', label: 'Base Price (USD) *' },
                { key: 'discount_amount', label: 'Discount Amount (USD)' },
                { key: 'vat_rate', label: 'VAT Rate (%)' },
                { key: 'stamp_duty', label: 'Stamp Duty (USD)' },
                { key: 'registration_fees', label: 'Registration Fees (USD)' },
                { key: 'legal_fees', label: 'Legal Fees (USD)' },
                { key: 'parking_cost', label: 'Parking Cost (USD)' },
                { key: 'other_charges', label: 'Other Charges (USD)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <input
                    type="number"
                    value={calc[key]}
                    onChange={e => setCalc(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="0"
                  />
                  {key === 'discount_amount' && calc.base_price && calc.discount_amount && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      = {((parseFloat(calc.discount_amount) / parseFloat(calc.base_price)) * 100).toFixed(1)}% discount
                    </p>
                  )}
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea rows={2} value={calc.notes} onChange={e => setCalc(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            {calcLoading && (
              <div className="flex justify-center py-8">
                <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {calcResult && !calcLoading && (
              <>
                {/* Total Display */}
                <div className="bg-blue-600 rounded-xl p-6 text-white text-center">
                  <p className="text-sm font-medium opacity-80 mb-1">Total Price</p>
                  <p className="text-4xl font-bold">${fmt(calcResult.total_usd)}</p>
                  <p className="text-blue-200 mt-1 text-sm">
                    ZiG {(calcResult.total_usd * rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-blue-300 text-xs mt-1">Rate: 1 USD = {rate} ZiG</p>
                </div>

                {/* Line Items */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Line Item</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">USD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lineItems.map((item, idx) => (
                        <tr key={idx} className={item.bold ? 'bg-slate-50' : ''}>
                          <td className={`px-4 py-2.5 ${item.bold ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                            {item.label}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono ${
                            item.negative ? 'text-red-600' : item.bold ? 'font-bold text-slate-800' : 'text-slate-700'
                          }`}>
                            {item.negative ? '-' : ''}${fmt(Math.abs(item.value))}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-blue-50 border-t-2 border-blue-200">
                        <td className="px-4 py-3 font-bold text-blue-900">TOTAL</td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-blue-900">${fmt(calcResult.total_usd)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <button onClick={handleGenerateFromCalc}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
                  <Plus size={16} /> Generate & Save Quotation
                </button>
              </>
            )}
            {!calcResult && !calcLoading && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <Calculator size={32} className="mx-auto mb-3 opacity-30" />
                <p>Enter a base price to calculate</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Quotation Modal */}
      <Modal open={showNewQuotation} onClose={() => setShowNewQuotation(false)} title="New Quotation" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Property *</label>
              <select value={quoteForm.property} onChange={e => setQuoteForm(p => ({ ...p, property: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select property...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name ?? p.address}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contact / Lead</label>
              <div className="flex gap-2 mb-1.5">
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="radio" checked={quoteForm.contactKind === 'contact'}
                    onChange={() => setQuoteForm(p => ({ ...p, contactKind: 'contact', lead: '' }))} />
                  Contact
                </label>
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="radio" checked={quoteForm.contactKind === 'lead'}
                    onChange={() => setQuoteForm(p => ({ ...p, contactKind: 'lead', contact: '' }))} />
                  Lead
                </label>
              </div>
              {quoteForm.contactKind === 'contact' ? (
                <select value={quoteForm.contact} onChange={e => setQuoteForm(p => ({ ...p, contact: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select contact...</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              ) : (
                <select value={quoteForm.lead} onChange={e => setQuoteForm(p => ({ ...p, lead: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select lead...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deal Type</label>
              <select value={quoteForm.deal_type} onChange={e => setQuoteForm(p => ({ ...p, deal_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="sale">Sale</option>
                <option value="lease">Lease</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Base Price (USD)</label>
              <input type="number" value={quoteForm.base_price_usd} onChange={e => setQuoteForm(p => ({ ...p, base_price_usd: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea rows={3} value={quoteForm.notes} onChange={e => setQuoteForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowNewQuotation(false)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleCreateQuotation}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Quotation</button>
          </div>
        </div>
      </Modal>

      {/* Send WhatsApp Modal */}
      <Modal open={!!sendModal} onClose={() => setSendModal(null)} title="Send via WhatsApp" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Send quotation <strong>{sendModal?.reference}</strong> via WhatsApp</p>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp Phone Number</label>
            <input value={whatsappPhone} onChange={e => setWhatsappPhone(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="+263771234567" />
            <p className="text-xs text-slate-400 mt-1">International format including country code</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setSendModal(null)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleSendWhatsApp}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              <Send size={14} /> Send
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
