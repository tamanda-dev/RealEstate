import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ArrowLeftRight, TrendingUp, Clock } from 'lucide-react'
import Badge from '../components/Badge'
import Table from '../components/Table'
import { currencyAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

function fmt(n, decimals = 4) {
  if (n == null) return '—'
  return Number(n).toFixed(decimals)
}

export default function CurrencyPage() {
  const { toast } = useToast()
  const [latest, setLatest] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)

  const [usdInput, setUsdInput] = useState('')
  const [zigInput, setZigInput] = useState('')

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    rate: '',
    source: 'RBZ',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const loadLatest = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await currencyAPI.latest()
      setLatest(data)
    } catch {
      toast('Failed to load current rate', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const { data } = await currencyAPI.list()
      setHistory(data?.results ?? data ?? [])
    } catch {
      toast('Failed to load rate history', 'error')
    } finally {
      setHistoryLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadLatest()
    loadHistory()
  }, [loadLatest, loadHistory])

  const currentRate = parseFloat(latest?.rate ?? 13.7)
  const inverseRate = currentRate > 0 ? (1 / currentRate).toFixed(6) : '—'

  const handleUsdChange = (val) => {
    setUsdInput(val)
    if (val && !isNaN(val)) {
      setZigInput((parseFloat(val) * currentRate).toFixed(2))
    } else {
      setZigInput('')
    }
  }

  const handleZigChange = (val) => {
    setZigInput(val)
    if (val && !isNaN(val)) {
      setUsdInput((parseFloat(val) / currentRate).toFixed(4))
    } else {
      setUsdInput('')
    }
  }

  const handleSetRate = async () => {
    if (!form.rate) { toast('Please enter a rate', 'error'); return }
    setSaving(true)
    try {
      await currencyAPI.create(form)
      toast('Exchange rate saved', 'success')
      setForm(p => ({ ...p, rate: '', notes: '' }))
      loadLatest()
      loadHistory()
    } catch {
      toast('Failed to save rate', 'error')
    } finally {
      setSaving(false)
    }
  }

  const historyColumns = [
    { key: 'date', label: 'Date', render: (v) => <span className="text-sm text-slate-600">{v ? new Date(v).toLocaleDateString() : '—'}</span> },
    { key: 'rate', label: '1 USD → ZiG', render: (v) => <span className="font-mono font-semibold text-slate-800">{fmt(v, 4)}</span> },
    { key: 'source', label: 'Source', render: (v) => <Badge value={v} /> },
    { key: 'set_by', label: 'Set By', render: (v, row) => <span className="text-sm text-slate-600">{row.set_by_name ?? v ?? '—'}</span> },
    { key: 'notes', label: 'Notes', render: (v) => <span className="text-sm text-slate-500">{v || '—'}</span> },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Exchange Rates — USD / ZiG</h1>
        <p className="text-slate-500 text-sm mt-0.5">Zimbabwe Gold (ZiG) exchange rate management — Reserve Bank of Zimbabwe</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Rate Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-700">Current Rate</h2>
              <button onClick={loadLatest} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100">
                <RefreshCw size={15} />
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="text-center py-4">
                  <p className="text-4xl font-bold text-slate-800">{fmt(latest?.rate, 4)}</p>
                  <p className="text-slate-500 text-sm mt-1">ZiG per 1 USD</p>
                  <p className="text-slate-400 text-xs mt-3">Inverse: 1 ZiG = {inverseRate} USD</p>
                </div>
                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Source</span>
                    <Badge value={latest?.source ?? '—'} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Date Set</span>
                    <span className="text-slate-700 font-medium">
                      {latest?.date ? new Date(latest.date).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  {latest?.set_by_name && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Set By</span>
                      <span className="text-slate-700">{latest.set_by_name}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Live Converter */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <ArrowLeftRight size={16} /> Live Converter
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">USD Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
                  <input
                    type="number"
                    value={usdInput}
                    onChange={e => handleUsdChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2.5 text-sm font-mono"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <ArrowLeftRight size={14} className="text-blue-600" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ZiG Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">ZiG</span>
                  <input
                    type="number"
                    value={zigInput}
                    onChange={e => handleZigChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg pl-12 pr-3 py-2.5 text-sm font-mono"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <p className="text-center text-xs text-slate-400">Rate: 1 USD = {fmt(latest?.rate, 4)} ZiG</p>
            </div>
          </div>

          {/* Set New Rate */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <TrendingUp size={16} /> Set New Rate
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date *</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Rate (ZiG per USD) *</label>
                <input type="number" step="0.0001" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="13.7000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Source *</label>
                <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="RBZ">RBZ Official</option>
                  <option value="interbank">Interbank</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Optional notes" />
              </div>
              <button onClick={handleSetRate} disabled={saving}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Set Rate'}
              </button>
            </div>
          </div>
        </div>

        {/* Rate History */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              <h2 className="font-semibold text-slate-700">Rate History</h2>
            </div>
            <Table columns={historyColumns} data={history} loading={historyLoading} emptyMessage="No rate history found" />
          </div>
        </div>
      </div>
    </div>
  )
}
