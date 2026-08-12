import { useState, useEffect, useCallback, useMemo } from 'react'
import { Mail, MessageSquareText, Send, AlertCircle, CheckCheck, Users2, Plus, Pencil, Trash2 } from 'lucide-react'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Table from '../components/Table'
import Modal from '../components/Modal'
import { messagingAPI, usersAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

const SMS_TABS = ['Send Message', 'Message Log']
const EMAIL_TABS = ['Send Message', 'Message Log', 'Templates']

const RECIPIENT_FILTERS = [
  { value: 'all', label: 'All Users' },
  { value: 'landlord', label: 'Landlords' },
  { value: 'tenant', label: 'Tenants' },
  { value: 'staff', label: 'Staff' },
]
const STAFF_ROLES = ['admin', 'sales_manager', 'property_manager', 'valuation_manager', 'accountant', 'agent', 'manager']
const roleMatches = (u, filter) => {
  if (filter === 'all') return true
  if (filter === 'landlord') return ['landlord', 'owner'].includes(u.role)
  if (filter === 'tenant') return u.role === 'tenant'
  if (filter === 'staff') return STAFF_ROLES.includes(u.role)
  return true
}
const displayName = (u) => (u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username)

const emptyTemplateForm = { name: '', subject: '', body: '', is_active: true }

export default function MessagingPage() {
  const { toast } = useToast()
  const [channel, setChannel] = useState('sms')
  const [activeTab, setActiveTab] = useState('Send Message')

  const [stats, setStats] = useState({})
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  const [users, setUsers] = useState([])
  const [recipientFilter, setRecipientFilter] = useState('all')
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedBulkIds, setSelectedBulkIds] = useState([])

  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [smsBody, setSmsBody] = useState('')
  const [emailForm, setEmailForm] = useState({ subject: '', body: '' })
  const [sending, setSending] = useState(false)

  const [templateModal, setTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm)
  const [savingTemplate, setSavingTemplate] = useState(false)

  const api = channel === 'sms' ? messagingAPI.sms : messagingAPI.email
  const TABS = channel === 'sms' ? SMS_TABS : EMAIL_TABS

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.stats()
      setStats(data ?? {})
    } catch { /* stat cards just stay at 0 */ }
  }, [api])

  const loadMessages = useCallback(async () => {
    setMessagesLoading(true)
    try {
      const { data } = await api.list()
      setMessages(Array.isArray(data) ? data : data?.results ?? [])
    } catch {
      toast('Failed to load message log', 'error')
    } finally {
      setMessagesLoading(false)
    }
  }, [api, toast])

  const loadTemplates = useCallback(async () => {
    try {
      const { data } = await messagingAPI.emailTemplates.list()
      setTemplates(Array.isArray(data) ? data : data?.results ?? [])
    } catch { /* templates list just stays empty */ }
  }, [])

  useEffect(() => {
    usersAPI.list({ page_size: 500 }).then(({ data }) => {
      setUsers(Array.isArray(data) ? data : data?.results ?? [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadStats()
    if (activeTab === 'Message Log') loadMessages()
    if (activeTab === 'Templates') loadTemplates()
  }, [channel, activeTab, loadStats, loadMessages, loadTemplates])

  useEffect(() => {
    if (channel === 'sms') setBulkMode(false)
  }, [channel])

  const eligibleUsers = useMemo(() => {
    const field = channel === 'sms' ? 'phone' : 'email'
    return users.filter((u) => roleMatches(u, recipientFilter) && u[field])
  }, [users, recipientFilter, channel])

  const handleSelectTemplate = (id) => {
    setSelectedTemplateId(id)
    const t = templates.find((tpl) => String(tpl.id) === String(id))
    if (t) setEmailForm({ subject: t.subject, body: t.body })
  }

  const toggleBulkId = (id) => {
    setSelectedBulkIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const toggleSelectAllBulk = () => {
    if (selectedBulkIds.length === eligibleUsers.length) setSelectedBulkIds([])
    else setSelectedBulkIds(eligibleUsers.map((u) => u.id))
  }

  const handleSendSms = async (e) => {
    e.preventDefault()
    const user = users.find((u) => String(u.id) === String(selectedUserId))
    if (!user) { toast('Select a recipient', 'error'); return }
    setSending(true)
    try {
      const res = await messagingAPI.sms.send({
        to_phone: user.phone, to_name: displayName(user), recipient_id: user.id, body: smsBody,
      })
      const simulated = res.data?.status === 'simulated'
      toast(simulated ? 'SMS simulated (Twilio not configured)' : 'SMS sent', 'success')
      setSmsBody('')
      setSelectedUserId('')
      loadStats()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      toast((Array.isArray(firstError) ? firstError[0] : firstError) ?? 'Failed to send SMS', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleSendEmail = async (e) => {
    e.preventDefault()
    const user = users.find((u) => String(u.id) === String(selectedUserId))
    if (!user) { toast('Select a recipient', 'error'); return }
    setSending(true)
    try {
      await messagingAPI.email.send({
        to_email: user.email, to_name: displayName(user), recipient_id: user.id,
        subject: emailForm.subject, body: emailForm.body,
      })
      toast('Email sent', 'success')
      setEmailForm({ subject: '', body: '' })
      setSelectedUserId('')
      setSelectedTemplateId('')
      loadStats()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      toast((Array.isArray(firstError) ? firstError[0] : firstError) ?? 'Failed to send email', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleBulkSendEmail = async (e) => {
    e.preventDefault()
    if (selectedBulkIds.length === 0) { toast('Select at least one recipient', 'error'); return }
    if (!selectedTemplateId && !(emailForm.subject && emailForm.body)) {
      toast('Choose a template or write a subject and message', 'error'); return
    }
    setSending(true)
    try {
      const payload = { recipient_ids: selectedBulkIds }
      if (selectedTemplateId) payload.template_id = selectedTemplateId
      else { payload.subject = emailForm.subject; payload.body = emailForm.body }
      const { data } = await messagingAPI.email.bulkSend(payload)
      toast(`Sent ${data.sent}, failed ${data.failed}${data.skipped_no_email ? `, ${data.skipped_no_email} skipped (no email on file)` : ''}`, 'success')
      setSelectedBulkIds([])
      loadStats()
    } catch (err) {
      toast(err?.response?.data?.error ?? 'Failed to send bulk email', 'error')
    } finally {
      setSending(false)
    }
  }

  // ── Templates ──
  const openAddTemplate = () => {
    setEditingTemplate(null)
    setTemplateForm(emptyTemplateForm)
    setTemplateModal(true)
  }

  const openEditTemplate = (t) => {
    setEditingTemplate(t)
    setTemplateForm({ name: t.name, subject: t.subject, body: t.body, is_active: t.is_active })
    setTemplateModal(true)
  }

  const handleSaveTemplate = async (e) => {
    e.preventDefault()
    setSavingTemplate(true)
    try {
      if (editingTemplate) await messagingAPI.emailTemplates.update(editingTemplate.id, templateForm)
      else await messagingAPI.emailTemplates.create(templateForm)
      toast(editingTemplate ? 'Template updated' : 'Template created', 'success')
      setTemplateModal(false)
      loadTemplates()
    } catch (err) {
      toast(err?.response?.data?.name?.[0] ?? 'Failed to save template', 'error')
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return
    try {
      await messagingAPI.emailTemplates.delete(id)
      loadTemplates()
    } catch {
      toast('Failed to delete template', 'error')
    }
  }

  const smsColumns = [
    { key: 'to_phone', label: 'Phone', render: (v) => <span className="font-mono text-sm">{v}</span> },
    { key: 'to_name', label: 'Name', render: (v) => v || '—' },
    { key: 'body', label: 'Message', render: (v) => (
      <span className="text-sm text-slate-500 max-w-64 truncate block">{(v ?? '').slice(0, 80)}</span>
    ) },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'sent_at', label: 'Sent At', render: (v) => (
      <span className="text-xs text-slate-500">{v ? new Date(v).toLocaleString() : '—'}</span>
    ) },
  ]

  const emailColumns = [
    { key: 'to_email', label: 'Email', render: (v) => <span className="font-mono text-sm">{v}</span> },
    { key: 'to_name', label: 'Name', render: (v) => v || '—' },
    { key: 'subject', label: 'Subject', render: (v) => <span className="text-sm">{v}</span> },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'sent_at', label: 'Sent At', render: (v) => (
      <span className="text-xs text-slate-500">{v ? new Date(v).toLocaleString() : '—'}</span>
    ) },
  ]

  const accent = channel === 'sms' ? '#2563eb' : '#4f46e5'
  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: accent }}>
            {channel === 'sms' ? <MessageSquareText size={20} className="text-white" /> : <Mail size={20} className="text-white" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">SMS / Email</h1>
            <p className="text-slate-500 text-sm">Send messages to anyone in the system via SMS (Twilio) or email</p>
          </div>
        </div>

        {/* Channel toggle */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-sm font-medium">
          <button onClick={() => { setChannel('sms'); setActiveTab('Send Message') }}
            className={`px-4 py-2 rounded-md transition-colors ${channel === 'sms' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
            SMS
          </button>
          <button onClick={() => setChannel('email')}
            className={`px-4 py-2 rounded-md transition-colors ${channel === 'email' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
            Email
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard icon={Send} label="Total Sent" value={stats.total_sent ?? 0} color="blue" />
        <StatCard icon={AlertCircle} label="Failed" value={stats.failed ?? 0} color="red" />
        {channel === 'sms' && (
          <StatCard icon={CheckCheck} label="Simulated" value={stats.simulated ?? 0} color="gray" />
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? 'text-slate-800' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
              style={activeTab === tab ? { borderColor: accent } : undefined}>
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Send Message Tab */}
      {activeTab === 'Send Message' && (
        <div className="max-w-2xl space-y-4">
          {channel === 'email' && (
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-sm font-medium w-fit">
              <button onClick={() => setBulkMode(false)}
                className={`px-4 py-1.5 rounded-md transition-colors ${!bulkMode ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                Single Recipient
              </button>
              <button onClick={() => setBulkMode(true)}
                className={`px-4 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${bulkMode ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                <Users2 size={14} /> Bulk Send
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-4">
              {channel === 'sms' ? 'Compose SMS' : bulkMode ? 'Bulk Email' : 'Compose Email'}
            </h3>

            {!bulkMode && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter Recipients</label>
                <select value={recipientFilter} onChange={(e) => setRecipientFilter(e.target.value)} className={inputCls}>
                  {RECIPIENT_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            )}

            {channel === 'sms' ? (
              <form onSubmit={handleSendSms} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Recipient *</label>
                  <select required value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={inputCls}>
                    <option value="">Select a person…</option>
                    {eligibleUsers.map((u) => (
                      <option key={u.id} value={u.id}>{displayName(u)} — {u.phone} ({u.role})</option>
                    ))}
                  </select>
                  {eligibleUsers.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">No users with a phone number match this filter.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Message *</label>
                  <textarea required rows={5} value={smsBody} onChange={(e) => setSmsBody(e.target.value)}
                    className={`${inputCls} resize-none`} />
                </div>
                <button type="submit" disabled={sending}
                  className="w-full py-3 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: accent }}>
                  <Send size={16} /> {sending ? 'Sending...' : 'Send SMS'}
                </button>
              </form>
            ) : bulkMode ? (
              <form onSubmit={handleBulkSendEmail} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Send To</label>
                  <select value={recipientFilter} onChange={(e) => { setRecipientFilter(e.target.value); setSelectedBulkIds([]) }} className={inputCls}>
                    {RECIPIENT_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                  <label className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={eligibleUsers.length > 0 && selectedBulkIds.length === eligibleUsers.length}
                      onChange={toggleSelectAllBulk} className="rounded" />
                    Select all ({eligibleUsers.length})
                  </label>
                  {eligibleUsers.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selectedBulkIds.includes(u.id)} onChange={() => toggleBulkId(u.id)} className="rounded" />
                      <span>{displayName(u)}</span>
                      <span className="text-xs text-slate-400">{u.email}</span>
                    </label>
                  ))}
                  {eligibleUsers.length === 0 && (
                    <p className="text-xs text-slate-400 px-3 py-3">No users with an email address match this filter.</p>
                  )}
                </div>
                <p className="text-xs text-slate-500">{selectedBulkIds.length} recipient(s) selected</p>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Template</label>
                  <select value={selectedTemplateId} onChange={(e) => handleSelectTemplate(e.target.value)} className={inputCls}>
                    <option value="">— Write custom message —</option>
                    {templates.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subject {!selectedTemplateId && '*'}</label>
                  <input required={!selectedTemplateId} value={emailForm.subject}
                    onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Message {!selectedTemplateId && '*'}</label>
                  <textarea required={!selectedTemplateId} rows={6} value={emailForm.body}
                    onChange={(e) => setEmailForm((f) => ({ ...f, body: e.target.value }))} className={`${inputCls} resize-none`} />
                  <p className="text-xs text-slate-400 mt-1">Use {'{{name}}'}, {'{{email}}'} or {'{{due_date}}'} — filled in per recipient. {'{{due_date}}'} is their nearest unpaid rent due date, blank if none.</p>
                </div>
                <button type="submit" disabled={sending}
                  className="w-full py-3 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: accent }}>
                  <Users2 size={16} /> {sending ? 'Sending...' : `Send to ${selectedBulkIds.length} Recipient${selectedBulkIds.length === 1 ? '' : 's'}`}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSendEmail} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Recipient *</label>
                  <select required value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={inputCls}>
                    <option value="">Select a person…</option>
                    {eligibleUsers.map((u) => (
                      <option key={u.id} value={u.id}>{displayName(u)} — {u.email} ({u.role})</option>
                    ))}
                  </select>
                  {eligibleUsers.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">No users with an email address match this filter.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Template</label>
                  <select value={selectedTemplateId} onChange={(e) => handleSelectTemplate(e.target.value)} className={inputCls}>
                    <option value="">— Write custom message —</option>
                    {templates.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subject *</label>
                  <input required value={emailForm.subject}
                    onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Message *</label>
                  <textarea required rows={7} value={emailForm.body}
                    onChange={(e) => setEmailForm((f) => ({ ...f, body: e.target.value }))} className={`${inputCls} resize-none`} />
                </div>
                <button type="submit" disabled={sending}
                  className="w-full py-3 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: accent }}>
                  <Send size={16} /> {sending ? 'Sending...' : 'Send Email'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Message Log Tab */}
      {activeTab === 'Message Log' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table
            columns={channel === 'sms' ? smsColumns : emailColumns}
            data={messages}
            loading={messagesLoading}
            emptyMessage={`No ${channel === 'sms' ? 'SMS' : 'email'} messages sent yet.`}
          />
        </div>
      )}

      {/* Templates Tab (email only) */}
      {activeTab === 'Templates' && channel === 'email' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openAddTemplate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: accent }}>
              <Plus size={15} /> Add Template
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-semibold text-slate-800">{t.name}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditTemplate(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-2">{t.subject}</p>
                <p className="text-sm text-slate-600 line-clamp-3">{t.body}</p>
                {!t.is_active && <Badge value="inactive" />}
              </div>
            ))}
            {templates.length === 0 && (
              <div className="col-span-2 text-center py-16 text-slate-400">No email templates yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Template Modal */}
      <Modal open={templateModal} onClose={() => setTemplateModal(false)}
        title={editingTemplate ? 'Edit Template' : 'Add Template'} size="md">
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Template Name *</label>
            <input required value={templateForm.name}
              onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subject *</label>
            <input required value={templateForm.subject}
              onChange={(e) => setTemplateForm((f) => ({ ...f, subject: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Body *</label>
            <textarea required rows={6} value={templateForm.body}
              onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))} className={`${inputCls} resize-none`}
              placeholder="Hello {{name}}, ..." />
            <p className="text-xs text-slate-400 mt-1">Use {'{{name}}'}, {'{{email}}'} or {'{{due_date}}'} for per-recipient values. {'{{due_date}}'} only fills in on bulk sends.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="tpl_active" checked={templateForm.is_active}
              onChange={(e) => setTemplateForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
            <label htmlFor="tpl_active" className="text-sm text-slate-700">Active (selectable when composing)</label>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setTemplateModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={savingTemplate}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60" style={{ backgroundColor: accent }}>
              {savingTemplate ? 'Saving…' : editingTemplate ? 'Save Changes' : 'Add Template'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
