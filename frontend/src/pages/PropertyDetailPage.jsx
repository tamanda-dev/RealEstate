import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2, AlertTriangle } from 'lucide-react'
import { propertiesAPI } from '../services/api'
import Badge from '../components/Badge'

export default function PropertyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [property, setProperty] = useState(null)
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const [propRes, unitsRes] = await Promise.allSettled([
          propertiesAPI.get(id),
          propertiesAPI.units(id),
        ])
        if (propRes.status === 'fulfilled') setProperty(propRes.value.data)
        else setError('Property not found.')
        if (unitsRes.status === 'fulfilled') {
          const d = unitsRes.value.data
          setUnits(Array.isArray(d) ? d : d.results ?? [])
        }
      } catch {
        setError('Failed to load property.')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [id])

  const fmtCurrency = (val) => val ? `$${Number(val).toLocaleString()}` : '—'

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-gray-400">
        <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  if (error || !property) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {error || 'Property not found.'}
        </div>
        <button onClick={() => navigate('/properties')} className="mt-4 flex items-center gap-2 text-blue-600 text-sm hover:underline">
          <ArrowLeft size={15} /> Back to Properties
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/properties')} className="flex items-center gap-2 text-blue-600 text-sm hover:underline mb-6">
        <ArrowLeft size={15} /> Back to Properties
      </button>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building2 size={28} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{property.name}</h1>
              <p className="text-gray-500 text-sm">{property.address}{property.city ? `, ${property.city}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge value={property.status} />
            <Badge value={property.property_type} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Units', value: property.num_units ?? '—' },
            { label: 'Year Built', value: property.year_built ?? '—' },
            { label: 'Purchase Price', value: fmtCurrency(property.purchase_price) },
            { label: 'Current Value', value: fmtCurrency(property.current_value) },
          ].map((item) => (
            <div key={item.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className="font-semibold text-gray-800 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>

        {property.description && (
          <p className="mt-4 text-sm text-gray-600">{property.description}</p>
        )}
      </div>

      {/* Units */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Units ({units.length})</h2>
        {units.length === 0 ? (
          <p className="text-gray-400 text-sm">No units found for this property.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50">
                  {['Unit #', 'Type', 'Bedrooms', 'Bathrooms', 'Area (sqft)', 'Rent', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {units.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{u.unit_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.unit_type ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.bedrooms ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.bathrooms ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.area_sqft ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtCurrency(u.monthly_rent)}</td>
                    <td className="px-4 py-3"><Badge value={u.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
