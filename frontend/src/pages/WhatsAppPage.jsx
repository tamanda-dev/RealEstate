import { useState, useEffect, useCallback } from 'react'
import {
  MessageCircle, Send, ArrowUp, ArrowDown, Settings,
  CheckCheck, Check, AlertCircle, RefreshCw, Plus
} from 'lucide-react'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import { whatsappAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

const TABS = ['Send Message', 'Message Log', 'Templates', 'Settings']

const STATUS_ICONS = {
  delivered: CheckCheck,
  read: CheckCheck,
  sent: Check,
  failed: AlertCircle,
}

export default function WhatsAppPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('Send Message')

  // Stats
  const [stats, setStats] = useState({})

  // Send tab
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [sendForm, setSendForm] = useState({ phone: '', template: '', variables: {} })
  const [preview, setPreview] = useState('')
  const [sending, setSending] = useState(false)

  // Log tab
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  // Config tab
  const [config, setConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configForm, setConfigForm] = useState({})

  // Template modal
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [templateForm, setTemplateForm] = useState({
    name: '', usage_type: 'general', language: 'en', body_text: '',
  })

  const loadStats = useCallback(async () => {
    try {
      const { data } = await whatsappAPI.stats()
      setStats(data ?? {})
    } catch {}
  }, [])

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const { data } = await whatsappAPI.templates()
      setTemplates(data?.results ?? data ?? [])
    } catch {
      toast('Failed to load templates', 'error')
    } finally {
      setTemplatesLoading(false)
    }
  }, [toast])

  const loadMessages = useCallback(async () => {
    setMessagesLoading(true)
    try {
      const { data } = await whatsappAPI.messages()
      setMessages(data?.results ?? data ?? [])
    } catch {
      toast('Failed to load messages', 'error')
    } finally {
      setMessagesLoading(false)
    }
  }, [toast])

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const { data } = await whatsappAPI.getConfig()
      setConfig(data)
      setConfigForm({
        phone_number_id: data?.phone_number_id ?? '',
        display_phone: data?.display_phone ?? '',
        is_active: data?.is_active ?? false,
        simulate_mode: data?.simulate_mode ?? true,
      })
    } catch {
      toast('Failed to load config', 'error')
    } finally {
      setConfigLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadStats()
    loadTemplates()
  }, [loadStats, loadTemplates])

  useEffect(() => {
    if (activeTab === 'Message Log') loadMessages()
    if (activeTab === 'Settings') loadConfig()
  }, [activeTab, loadMessages, loadConfig])

  // Build preview when template or variables change
  useEffect(() => {
    if (!selectedTemplate) { setPreview(''); return }
    let text = selectedTemplate.body_text ?? ''
    const vars = sendForm.variables ?? {}
    Object.entries(vars).forEach(([key, val]) => {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`)
    })
    setPreview(text)
  }, [selectedTemplate, sendForm.variables])

  const handleTemplateSelect = (tmpl) => {
    setSelectedTemplate(tmpl)
    setSendForm(p => ({ ...p, template: tmpl.id ?? tmpl.name, variables: {} }))
  }

  const handleSend = async () => {
    if (!sendForm.phone) { toast('Please enter a phone number', 'error'); return }
    if (!sendForm.template) { toast('Please select a template', 'error'); return }
    setSending(true)
    try {
      await whatsappAPI.send({
        phone: sendForm.phone,
        template_id: sendForm.template,
        variables: sendForm.variables,
      })
      toast('Message sent successfully', 'success')
      setSendForm({ phone: '', template: '', variables: {} })
      setSelectedTemplate(null)
      loadStats()
    } catch {
      toast('Failed to send message', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await whatsappAPI.saveConfig(configForm)
      toast('Settings saved', 'success')
      loadConfig()
    } catch {
      toast('Failed to save settings', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleCreateTemplate = async () => {
    try {
      await whatsappAPI.createTemplate(templateForm)
      toast('Template created', 'success')
      setShowAddTemplate(false)
      loadTemplates()
    } catch {
      toast('Failed to create template', 'error')
    }
  }

  // Extract variable names from body_text {{var}} patterns
  const getVariableLabels = (tmpl) => {
    if (!tmpl?.body_text && !tmpl?.variable_labels) return []
    if (tmpl.variable_labels) return tmpl.variable_labels
    const matches = (tmpl.body_text ?? '').match(/\{\{(\w+)\}\}/g) ?? []
    return [...new Set(matches.map(m => m.slice(2, -2)))]
  }

  const msgColumns = [
    { key: 'direction', label: 'Dir', render: (v) => (
      v === 'inbound'
        ? <ArrowDown size={16} className="text-green-600" />
        : <ArrowUp size={16} className="text-blue-600" />
    )},
    { key: 'phone', label: 'Phone', render: (v) => <span className="font-mono text-sm">{v}</span> },
    { key: 'contact_name', label: 'Contact', render: (v) => <span className="text-sm">{v || '—'}</span> },
    { key: 'template_name', label: 'Template', render: (v) => <span className="text-sm">{v || '—'}</span> },
    { key: 'message_body', label: 'Preview', render: (v) => (
      <span className="text-sm text-slate-500 max-w-48 truncate block">{(v ?? '').slice(0, 60)}</span>
    )},
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'created_at', label: 'Sent At', render: (v) => (
      <span className="text-xs text-slate-500">{v ? new Date(v).toLocaleString() : '—'}</span>
    )},
  ]

  const varLabels = getVariableLabels(selectedTemplate)
  const isSimulate = config?.simulate_mode || configForm?.simulate_mode

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#25D366' }}>
            <MessageCircle size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">WhatsApp Integration</h1>
            <p className="text-slate-500 text-sm">Business messaging via WhatsApp API</p>
          </div>
        </div>
        {isSimulate && (
          <span className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
            Simulate Mode
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard icon={Send} label="Total Sent" value={stats.total_sent ?? 0} color="blue" />
        <StatCard icon={CheckCheck} label="Delivered" value={stats.delivered ?? 0} color="green" />
        <StatCard icon={CheckCheck} label="Read" value={stats.read ?? 0} color="indigo" />
        <StatCard icon={AlertCircle} label="Failed" value={stats.failed ?? 0} color="red" />
        <StatCard icon={MessageCircle} label="Simulated" value={stats.simulated ?? 0} color="gray" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? 'border-green-500 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Send Message Tab */}
      {activeTab === 'Send Message' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-700 mb-4">Compose Message</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number *</label>
                  <input value={sendForm.phone} onChange={e => setSendForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="+263771234567" />
                  <p className="text-xs text-slate-400 mt-1">International format with country code</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Select Template *</label>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {templatesLoading ? (
                      <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /></div>
                    ) : templates.map((tmpl, idx) => (
                      <button key={tmpl.id ?? idx} onClick={() => handleTemplateSelect(tmpl)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedTemplate?.id === tmpl.id
                            ? 'border-green-400 bg-green-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <p className="text-sm font-medium text-slate-800">{tmpl.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{tmpl.usage_type} · {tmpl.language}</p>
                      </button>
                    ))}
                    {!templatesLoading && templates.length === 0 && (
                      <p className="text-center text-slate-400 text-sm py-4">No templates available</p>
                    )}
                  </div>
                </div>

                {/* Variable Inputs */}
                {varLabels.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-2">Template Variables</p>
                    <div className="space-y-2">
                      {varLabels.map(varName => (
                        <div key={varName}>
                          <label className="block text-xs text-slate-500 mb-1">{'{{'}{varName}{'}}'}</label>
                          <input
                            value={sendForm.variables[varName] ?? ''}
                            onChange={e => setSendForm(p => ({
                              ...p,
                              variables: { ...p.variables, [varName]: e.target.value }
                            }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                            placeholder={`Enter ${varName}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={handleSend} disabled={sending}
                  className="w-full py-3 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: '#25D366' }}>
                  <Send size={16} /> {sending ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-700 mb-4">Message Preview</h3>
              <div className="bg-slate-50 rounded-xl p-4 min-h-32">
                {preview ? (
                  <div className="inline-block bg-white rounded-xl rounded-tl-none shadow-sm p-3 max-w-xs">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{preview}</p>
                    <p className="text-[10px] text-slate-400 mt-1 text-right">Preview</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
                    Select a template to preview
                  </div>
                )}
              </div>
              {config?.simulate_mode && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs text-amber-700">
                    <strong>Simulate Mode:</strong> Messages will NOT be sent to real WhatsApp numbers.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message Log Tab */}
      {activeTab === 'Message Log' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table columns={msgColumns} data={messages} loading={messagesLoading} emptyMessage="No messages in log" />
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'Templates' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddTemplate(true)}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium"
              style={{ backgroundColor: '#25D366' }}>
              <Plus size={16} /> Add Template
            </button>
          </div>
          {templatesLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tmpl, idx) => {
                const vars = getVariableLabels(tmpl)
                return (
                  <div key={tmpl.id ?? idx} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <p className="font-semibold text-slate-800">{tmpl.name}</p>
                      <MessageCircle size={18} className="text-slate-300 flex-shrink-0" style={{ color: '#25D366' }} />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge value={tmpl.usage_type} />
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{tmpl.language}</span>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-3">{tmpl.body_text}</p>
                    {vars.length > 0 && (
                      <p className="text-xs text-slate-400 mt-2">{vars.length} variable{vars.length !== 1 ? 's' : ''}: {vars.join(', ')}</p>
                    )}
                  </div>
                )
              })}
              {templates.length === 0 && (
                <div className="col-span-3 text-center py-16 text-slate-400">No templates configured</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'Settings' && (
        <div className="max-w-2xl space-y-6">
          {configForm.simulate_mode && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">Development / Simulate Mode Active</p>
                <p className="text-sm text-amber-700 mt-1">
                  Messages are <strong>NOT</strong> sent to real WhatsApp numbers. To go live, disable Simulate Mode
                  and configure your Meta Business API credentials below.
                </p>
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Settings size={16} /> WhatsApp Business Config
            </h3>
            {configLoading ? (
              <div className="flex justify-center py-8"><div className="w-7 h-7 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number ID</label>
                  <input value={configForm.phone_number_id ?? ''} onChange={e => setConfigForm(p => ({ ...p, phone_number_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="Meta Business phone number ID" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Display Phone Number</label>
                  <input value={configForm.display_phone ?? ''} onChange={e => setConfigForm(p => ({ ...p, display_phone: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="+263 XX XXXXXXX" />
                </div>
                {config?.webhook_url && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Webhook URL (read-only)</label>
                    <input value={config.webhook_url} readOnly
                      className="w-full border border-slate-100 rounded-lg px-3 py-2 text-sm font-mono bg-slate-50 text-slate-500 cursor-not-allowed" />
                  </div>
                )}
                <div className="space-y-3 pt-1">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Active</p>
                      <p className="text-xs text-slate-400">Enable WhatsApp integration</p>
                    </div>
                    <div className={`w-10 h-6 rounded-full transition-colors relative ${configForm.is_active ? 'bg-green-500' : 'bg-slate-300'}`}
                      onClick={() => setConfigForm(p => ({ ...p, is_active: !p.is_active }))}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${configForm.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Simulate Mode</p>
                      <p className="text-xs text-slate-400">Messages logged but not sent to WhatsApp</p>
                    </div>
                    <div className={`w-10 h-6 rounded-full transition-colors relative ${configForm.simulate_mode ? 'bg-amber-400' : 'bg-slate-300'}`}
                      onClick={() => setConfigForm(p => ({ ...p, simulate_mode: !p.simulate_mode }))}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${configForm.simulate_mode ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                  </label>
                </div>
                <button onClick={handleSaveConfig} disabled={savingConfig}
                  className="w-full py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: '#25D366' }}>
                  {savingConfig ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Template Modal */}
      <Modal open={showAddTemplate} onClose={() => setShowAddTemplate(false)} title="Add WhatsApp Template" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Template Name *</label>
            <input value={templateForm.name} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="rent_reminder" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Usage Type</label>
              <select value={templateForm.usage_type} onChange={e => setTemplateForm(p => ({ ...p, usage_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="general">General</option>
                <option value="rent_reminder">Rent Reminder</option>
                <option value="quotation">Quotation</option>
                <option value="reservation">Reservation</option>
                <option value="maintenance">Maintenance</option>
                <option value="marketing">Marketing</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Language</label>
              <select value={templateForm.language} onChange={e => setTemplateForm(p => ({ ...p, language: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="en">English</option>
                <option value="sn">Shona</option>
                <option value="nd">Ndebele</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Message Body *</label>
            <textarea rows={5} value={templateForm.body_text} onChange={e => setTemplateForm(p => ({ ...p, body_text: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none font-mono"
              placeholder="Hello {{name}}, your rent of ${{amount}} is due on {{date}}." />
            <p className="text-xs text-slate-400 mt-1">Use {'{{variable_name}}'} for dynamic values</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAddTemplate(false)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleCreateTemplate}
              className="px-4 py-2 text-sm text-white rounded-lg font-medium"
              style={{ backgroundColor: '#25D366' }}>Add Template</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
