import { useState, useEffect, useCallback } from 'react'
import { Mail, MessageSquareText, Send, AlertCircle, CheckCheck } from 'lucide-react'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Table from '../components/Table'
import { messagingAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

const TABS = ['Send Message', 'Message Log']

const emptySmsForm = { to_phone: '', to_name: '', body: '' }
const emptyEmailForm = { to_email: '', to_name: '', subject: '', body: '' }

export default function MessagingPage() {
  const { toast } = useToast()
  const [channel, setChannel] = useState('sms')
  const [activeTab, setActiveTab] = useState('Send Message')

  const [stats, setStats] = useState({})
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  const [smsForm, setSmsForm] = useState(emptySmsForm)
  const [emailForm, setEmailForm] = useState(emptyEmailForm)
  const [sending, setSending] = useState(false)

  const api = channel === 'sms' ? messagingAPI.sms : messagingAPI.email

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

  useEffect(() => {
    loadStats()
    if (activeTab === 'Message Log') loadMessages()
  }, [channel, activeTab, loadStats, loadMessages])

  const handleSendSms = async (e) => {
    e.preventDefault()
    setSending(true)
    try {
      const res = await messagingAPI.sms.send(smsForm)
      const simulated = res.data?.status === 'simulated'
      toast(simulated ? 'SMS simulated (Twilio not configured)' : 'SMS sent', simulated ? 'success' : 'success')
      setSmsForm(emptySmsForm)
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
    setSending(true)
    try {
      await messagingAPI.email.send(emailForm)
      toast('Email sent', 'success')
      setEmailForm(emptyEmailForm)
      loadStats()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      toast((Array.isArray(firstError) ? firstError[0] : firstError) ?? 'Failed to send email', 'error')
    } finally {
      setSending(false)
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
            <p className="text-slate-500 text-sm">Send one-off client messages via SMS (Twilio) or email</p>
          </div>
        </div>

        {/* Channel toggle */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-sm font-medium">
          <button onClick={() => setChannel('sms')}
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
        <div className="max-w-xl">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-4">
              {channel === 'sms' ? 'Compose SMS' : 'Compose Email'}
            </h3>

            {channel === 'sms' ? (
              <form onSubmit={handleSendSms} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number *</label>
                  <input required value={smsForm.to_phone}
                    onChange={e => setSmsForm(p => ({ ...p, to_phone: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="0771234567" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Client Name</label>
                  <input value={smsForm.to_name}
                    onChange={e => setSmsForm(p => ({ ...p, to_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Message *</label>
                  <textarea required rows={5} value={smsForm.body}
                    onChange={e => setSmsForm(p => ({ ...p, body: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
                </div>
                <button type="submit" disabled={sending}
                  className="w-full py-3 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: accent }}>
                  <Send size={16} /> {sending ? 'Sending...' : 'Send SMS'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSendEmail} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email Address *</label>
                  <input required type="email" value={emailForm.to_email}
                    onChange={e => setEmailForm(p => ({ ...p, to_email: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="client@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Client Name</label>
                  <input value={emailForm.to_name}
                    onChange={e => setEmailForm(p => ({ ...p, to_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subject *</label>
                  <input required value={emailForm.subject}
                    onChange={e => setEmailForm(p => ({ ...p, subject: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Message *</label>
                  <textarea required rows={7} value={emailForm.body}
                    onChange={e => setEmailForm(p => ({ ...p, body: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
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
    </div>
  )
}
