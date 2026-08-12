import { useState, useEffect } from 'react'
import { Building2, Upload } from 'lucide-react'
import { companyAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1'

export default function CompanySettingsPage() {
  const { toast } = useToast()
  const [form, setForm] = useState({
    company_name: '', address: '', city: '', phone: '', email: '',
    website: '', registration_number: '', tax_number: '',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await companyAPI.get()
      setForm({
        company_name: data.company_name ?? '', address: data.address ?? '',
        city: data.city ?? '', phone: data.phone ?? '', email: data.email ?? '',
        website: data.website ?? '', registration_number: data.registration_number ?? '',
        tax_number: data.tax_number ?? '',
      })
      setLogoPreview(data.logo ?? null)
    } catch {
      toast('Failed to load company settings', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = new FormData()
      Object.entries(form).forEach(([k, v]) => payload.append(k, v))
      if (logoFile) payload.append('logo', logoFile)
      await companyAPI.update(payload)
      toast('Company settings saved', 'success')
      load()
    } catch (err) {
      toast(err?.response?.data?.error ?? 'Failed to save company settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 flex justify-center"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <Building2 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Company Settings</h1>
          <p className="text-slate-500 text-sm">
            Your company's name, logo and address — shown on generated reports and statements.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <label className={labelCls}>Company Logo</label>
          <div className="flex items-center gap-4">
            {logoPreview && (
              <img src={logoPreview} alt="Logo preview" className="h-16 w-auto object-contain border border-slate-100 rounded-lg p-1" />
            )}
            <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-slate-50">
              <Upload size={13} /> {logoPreview ? 'Change Logo' : 'Upload Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </label>
          </div>
        </div>

        <div>
          <label className={labelCls}>Company Name</label>
          <input className={inputCls} value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            placeholder="e.g. PropManager ZW (Pvt) Ltd" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Address</label>
            <input className={inputCls} value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" className={inputCls} value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Registration Number</label>
            <input className={inputCls} value={form.registration_number}
              onChange={(e) => setForm((f) => ({ ...f, registration_number: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Tax / VAT Number</label>
            <input className={inputCls} value={form.tax_number}
              onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))} />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
