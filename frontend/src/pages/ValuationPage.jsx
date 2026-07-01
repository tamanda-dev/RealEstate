import { useState, useEffect } from 'react'
import { BarChart2, Plus, AlertTriangle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { valuationAPI, propertiesAPI } from '../services/api'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'

const TABS = ['Valuations', 'CMA / Comparables', 'Price Trends']

export default function ValuationPage() {
  const [tab, setTab] = useState('Valuations')
  const [valuations, setValuations] = useState([])
  const [comparables, setComparables] = useState([])
  const [priceTrends, setPriceTrends] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [avmRunning, setAvmRunning] = useState(null)

  const [valModal, setValModal] = useState(false)
  const [valForm, setValForm] = useState({ property: '', method: 'manual', estimated_value: '', confidence_score: '' })
  const [savingVal, setSavingVal] = useState(false)

  const fetchValuations = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await valuationAPI.list()
      setValuations(Array.isArray(data) ? data : data.results ?? [])
    } catch {
      setError('Failed to load valuations.')
    } finally {
      setLoading(false)
    }
  }

  const fetchComparables = async () => {
    try {
      const { data } = await valuationAPI.comparables.list()
      setComparables(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchPriceTrends = async () => {
    try {
      const { data } = await valuationAPI.priceTrends.list()
      setPriceTrends(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchProperties = async () => {
    try {
      const { data } = await propertiesAPI.list()
      setProperties(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  useEffect(() => { fetchValuations(); fetchProperties() }, [])
  useEffect(() => {
    if (tab === 'CMA / Comparables') fetchComparables()
    if (tab === 'Price Trends') fetchPriceTrends()
  }, [tab])

  const handleRunAVM = async (propertyId, propertyName) => {
    setAvmRunning(propertyId)
    try {
      await valuationAPI.runAVM(propertyId)
      fetchValuations()
      alert(`AVM completed for ${propertyName}`)
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'AVM failed.')
    } finally {
      setAvmRunning(null)
    }
  }

  const handleAddValuation = async (e) => {
    e.preventDefault()
    setSavingVal(true)
    try {
      await valuationAPI.create(valForm)
      setValModal(false)
      setValForm({ property: '', method: 'manual', estimated_value: '', confidence_score: '' })
      fetchValuations()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to create valuation.')
    } finally {
      setSavingVal(false)
    }
  }

  const fmtCurrency = (v) => v != null ? `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—'

  const valColumns = [
    { key: 'property_name', label: 'Property', render: (v, row) => v ?? row.property ?? '—' },
    { key: 'method', label: 'Method', render: (v) => <Badge value={v} /> },
    { key: 'estimated_value', label: 'Estimated Value', render: (v) => fmtCurrency(v) },
    {
      key: 'confidence_score', label: 'Confidence',
      render: (v) => v != null ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-20">
            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(v, 100)}%` }} />
          </div>
          <span className="text-xs text-gray-600">{v}%</span>
        </div>
      ) : '—'
    },
    { key: 'valuation_date', label: 'Date', render: (v) => fmtDate(v) },
    {
      key: 'property', label: 'Run AVM',
      render: (v, row) => (
        <button
          onClick={() => handleRunAVM(v ?? row.property_id, row.property_name)}
          disabled={avmRunning === (v ?? row.property_id)}
          className="text-xs px-2.5 py-1 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
        >
          {avmRunning === (v ?? row.property_id) ? 'Running...' : 'Run AVM'}
        </button>
      )
    },
  ]

  const compColumns = [
    { key: 'address', label: 'Address' },
    { key: 'sale_price', label: 'Sale Price', render: (v) => fmtCurrency(v) },
    { key: 'sale_date', label: 'Sale Date', render: (v) => fmtDate(v) },
    { key: 'bedrooms', label: 'Beds', render: (v) => v ?? '—' },
    { key: 'bathrooms', label: 'Baths', render: (v) => v ?? '—' },
    { key: 'area_sqft', label: 'Area (sqft)', render: (v) => v ?? '—' },
    { key: 'price_per_sqft', label: '$/sqft', render: (v) => v ? `$${Number(v).toFixed(0)}` : '—' },
  ]

  // Prepare chart data
  const chartData = priceTrends.reduce((acc, t) => {
    const key = t.area ?? t.suburb ?? t.region ?? 'N/A'
    const existing = acc.find((a) => a.area === key)
    if (existing) {
      existing.avg_price = ((existing.avg_price * existing._count) + Number(t.avg_price ?? 0)) / (existing._count + 1)
      existing._count++
    } else {
      acc.push({ area: key, avg_price: Number(t.avg_price ?? 0), _count: 1 })
    }
    return acc
  }, []).slice(0, 12)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Valuation</h1>
          <p className="text-gray-500 text-sm mt-0.5">Property valuations, comparables & price trends</p>
        </div>
        {tab === 'Valuations' && (
          <button onClick={() => setValModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Add Valuation
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Valuations' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table columns={valColumns} data={valuations} loading={loading} emptyMessage="No valuations found." />
        </div>
      )}

      {tab === 'CMA / Comparables' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table columns={compColumns} data={comparables} loading={false} emptyMessage="No comparables found." />
        </div>
      )}

      {tab === 'Price Trends' && (
        <div>
          {priceTrends.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
              <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
              <p>No price trend data available.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-6">Average Price by Area</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="area" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Avg Price']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                  />
                  <Bar dataKey="avg_price" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Trend table */}
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Area', 'Period', 'Avg Price', 'Median Price', 'Transactions'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {priceTrends.map((t, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">{t.area ?? t.suburb ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{t.period ?? fmtDate(t.date)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">{fmtCurrency(t.avg_price)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{fmtCurrency(t.median_price)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{t.transaction_count ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Valuation Modal */}
      <Modal open={valModal} onClose={() => setValModal(false)} title="Add Valuation">
        <form onSubmit={handleAddValuation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
            <select required value={valForm.property} onChange={(e) => setValForm({ ...valForm, property: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
            <select value={valForm.method} onChange={(e) => setValForm({ ...valForm, method: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="manual">Manual</option>
              <option value="avm">AVM</option>
              <option value="cma">CMA</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value *</label>
            <input required type="number" step="0.01" value={valForm.estimated_value}
              onChange={(e) => setValForm({ ...valForm, estimated_value: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confidence Score (0-100)</label>
            <input type="number" min="0" max="100" value={valForm.confidence_score}
              onChange={(e) => setValForm({ ...valForm, confidence_score: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setValModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingVal}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {savingVal ? 'Saving...' : 'Add Valuation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
