import { useState, useEffect, useCallback } from 'react'
import {
  Upload, FileText, File, Image, FolderOpen,
  AlertTriangle, Download, Lock, Globe
} from 'lucide-react'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import { documentsAPI, propertiesAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

const DOC_ICONS = {
  pdf: FileText,
  image: Image,
  contract: FileText,
  title_deed: FileText,
  lease: FileText,
  insurance: File,
  default: File,
}

function getDocIcon(type) {
  const lower = (type || '').toLowerCase()
  if (lower.includes('pdf')) return DOC_ICONS.pdf
  if (lower.includes('image') || lower.includes('photo')) return DOC_ICONS.image
  if (lower.includes('title') || lower.includes('deed')) return DOC_ICONS.title_deed
  if (lower.includes('lease')) return DOC_ICONS.lease
  if (lower.includes('insur')) return DOC_ICONS.insurance
  return DOC_ICONS.default
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

export default function DocumentsPage() {
  const { toast } = useToast()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [expiringSoon, setExpiringSoon] = useState([])

  const [propertyFilter, setPropertyFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    property: '', unit: '', title: '', document_type: 'contract',
    is_confidential: false, is_public: false, expiry_date: '', notes: '',
  })
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [properties, setProperties] = useState([])
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (propertyFilter) params.property = propertyFilter
      if (typeFilter) params.document_type = typeFilter
      const [docsRes, expRes] = await Promise.all([
        documentsAPI.list(params),
        documentsAPI.expiringSoon(30),
      ])
      setDocuments(docsRes.data?.results ?? docsRes.data ?? [])
      setExpiringSoon(expRes.data?.results ?? expRes.data ?? [])
    } catch {
      toast('Failed to load documents', 'error')
    } finally {
      setLoading(false)
    }
  }, [propertyFilter, typeFilter, toast])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    propertiesAPI.list({ page_size: 200 })
      .then(r => setProperties(r.data?.results ?? r.data ?? []))
      .catch(() => {})
  }, [])

  const handlePropertyChange = async (propertyId) => {
    setUploadForm(f => ({ ...f, property: propertyId, unit: '' }))
    setUnits([])
    if (!propertyId) return
    setLoadingUnits(true)
    try {
      const r = await propertiesAPI.units(propertyId)
      setUnits(r.data?.results ?? r.data ?? [])
    } catch {
      setUnits([])
    } finally {
      setLoadingUnits(false)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) { toast('Please select a file', 'error'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      Object.entries(uploadForm).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) formData.append(k, v)
      })
      await documentsAPI.upload(formData)
      toast('Document uploaded successfully', 'success')
      setShowUpload(false)
      setSelectedFile(null)
      setUploadForm({ property: '', unit: '', title: '', document_type: 'contract', is_confidential: false, is_public: false, expiry_date: '', notes: '' })
      setUnits([])
      loadData()
    } catch {
      toast('Failed to upload document', 'error')
    } finally {
      setUploading(false)
    }
  }

  const expiring30 = expiringSoon.filter(d => {
    const days = daysUntil(d.expiry_date)
    return days !== null && days <= 30
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Document Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">Store and manage property documents securely</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Upload size={16} /> Upload Document
        </button>
      </div>

      {/* Expiry Alert Banner */}
      {expiring30.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Documents Expiring Within 30 Days</p>
            <p className="text-sm text-amber-700 mt-0.5">
              {expiring30.length} document{expiring30.length !== 1 ? 's' : ''} require attention:{' '}
              {expiring30.slice(0, 4).map(d => d.title).join(', ')}
              {expiring30.length > 4 && ` and ${expiring30.length - 4} more`}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-48">
          <option value="">All Properties</option>
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All Types</option>
          <option value="title_deed">Title Deed</option>
          <option value="contract">Contract</option>
          <option value="lease">Lease</option>
          <option value="insurance">Insurance</option>
          <option value="valuation">Valuation</option>
          <option value="permit">Permit</option>
          <option value="invoice">Invoice</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Document Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FolderOpen size={48} className="mb-3 opacity-30" />
          <p className="text-lg">No documents found</p>
          <p className="text-sm mt-1">Upload your first document to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {documents.map((doc, idx) => {
            const Icon = getDocIcon(doc.document_type)
            const expiryDays = daysUntil(doc.expiry_date)
            const isExpired = expiryDays !== null && expiryDays < 0
            const isExpiringSoon = expiryDays !== null && expiryDays >= 0 && expiryDays <= 30

            return (
              <div key={doc.id ?? idx} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isExpired ? 'bg-red-50' : 'bg-blue-50'
                  }`}>
                    <Icon size={20} className={isExpired ? 'text-red-500' : 'text-blue-600'} />
                  </div>
                  <div className="flex items-center gap-1">
                    {doc.is_confidential && (
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">
                        <Lock size={10} /> Private
                      </span>
                    )}
                    {doc.is_public && (
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded">
                        <Globe size={10} /> Public
                      </span>
                    )}
                  </div>
                </div>

                <p className="font-medium text-slate-800 text-sm leading-tight mb-1">{doc.title || '—'}</p>
                <p className="text-xs text-slate-500 mb-2">{doc.property_name ?? doc.property_display ?? '—'}</p>

                <div className="mb-2">
                  <Badge value={doc.document_type} />
                </div>

                <div className="text-xs text-slate-400 space-y-1">
                  {doc.created_at && (
                    <p>Uploaded: {new Date(doc.created_at).toLocaleDateString()}</p>
                  )}
                  {doc.expiry_date && (
                    <p className={isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-amber-600 font-medium' : ''}>
                      {isExpired ? 'Expired: ' : 'Expires: '}
                      {new Date(doc.expiry_date).toLocaleDateString()}
                      {isExpired && ' (EXPIRED)'}
                      {!isExpired && isExpiringSoon && ` (${expiryDays}d)`}
                    </p>
                  )}
                </div>

                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Download size={12} /> Download
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Document" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Property *</label>
              <select value={uploadForm.property} onChange={e => handlePropertyChange(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">— Select a property —</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Unit {loadingUnits ? '(loading…)' : '(optional)'}
              </label>
              <select value={uploadForm.unit} onChange={e => setUploadForm(f => ({ ...f, unit: e.target.value }))}
                disabled={!uploadForm.property || loadingUnits}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50">
                <option value="">— All units / general —</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.unit_number}{u.floor ? ` (Floor ${u.floor})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Document Title *</label>
              <input value={uploadForm.title} onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Title Deed — Stand 123" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Document Type *</label>
              <select value={uploadForm.document_type} onChange={e => setUploadForm(p => ({ ...p, document_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="title_deed">Title Deed</option>
                <option value="contract">Contract</option>
                <option value="lease">Lease</option>
                <option value="insurance">Insurance</option>
                <option value="valuation">Valuation</option>
                <option value="permit">Permit</option>
                <option value="invoice">Invoice</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Expiry Date</label>
              <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(p => ({ ...p, expiry_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={uploadForm.is_confidential} onChange={e => setUploadForm(p => ({ ...p, is_confidential: e.target.checked }))}
                  className="rounded border-slate-300" />
                <span className="text-sm text-slate-700">Confidential</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={uploadForm.is_public} onChange={e => setUploadForm(p => ({ ...p, is_public: e.target.checked }))}
                  className="rounded border-slate-300" />
                <span className="text-sm text-slate-700">Public (tenant visible)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">File *</label>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-blue-300 transition-colors">
              <input type="file" onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                className="hidden" id="doc-upload" />
              <label htmlFor="doc-upload" className="cursor-pointer">
                {selectedFile ? (
                  <div>
                    <FileText size={24} className="mx-auto mb-2 text-blue-600" />
                    <p className="text-sm font-medium text-blue-600">{selectedFile.name}</p>
                    <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm text-slate-500">Click to select file</p>
                    <p className="text-xs text-slate-400 mt-1">PDF, DOCX, JPG, PNG supported</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea rows={2} value={uploadForm.notes} onChange={e => setUploadForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowUpload(false)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleUpload} disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
