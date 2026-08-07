import { useState, useEffect } from 'react'
import { notificationsAPI } from '../services/api'
import { useToast } from '../context/ToastContext'
import {
  Bell, CheckCheck, RefreshCw, DollarSign,
  Wrench, FileText, Info,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const TYPE_META = {
  lease_expiring:     { icon: FileText,       color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  lease_expired:      { icon: FileText,       color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-200' },
  rent_overdue:       { icon: DollarSign,     color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-200' },
  payment_received:   { icon: DollarSign,     color: 'text-green-500',  bg: 'bg-green-50',  border: 'border-green-200' },
  work_order_update:  { icon: Wrench,         color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  maintenance_complete: { icon: Wrench,       color: 'text-green-500',  bg: 'bg-green-50',  border: 'border-green-200' },
  maintenance_assigned: { icon: Wrench,       color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  renewal_proposed:   { icon: FileText,       color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  system:             { icon: Info,           color: 'text-slate-500',  bg: 'bg-slate-50',  border: 'border-slate-200' },
}

const PRIORITY_BADGE = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-amber-100 text-amber-700',
  normal: 'bg-blue-100 text-blue-700',
  low:    'bg-slate-100 text-slate-600',
}

function NotifItem({ notif, onRead }) {
  const meta = TYPE_META[notif.notification_type] || TYPE_META.system
  const Icon = meta.icon
  const isUnread = !notif.is_read

  return (
    <div
      className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
        isUnread ? `${meta.bg} ${meta.border}` : 'bg-white border-slate-100'
      }`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
        <Icon size={18} className={meta.color} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className={`text-sm font-semibold ${isUnread ? 'text-slate-900' : 'text-slate-700'}`}>
            {notif.title}
          </p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[notif.priority] || PRIORITY_BADGE.normal}`}>
            {notif.priority}
          </span>
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{notif.message}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-slate-400">{notif.time_ago}</span>
          {notif.link && (
            <Link to={notif.link}
              className="text-xs text-blue-600 hover:underline font-medium"
              onClick={() => onRead(notif.id)}>
              View →
            </Link>
          )}
        </div>
      </div>

      {isUnread && (
        <button onClick={() => onRead(notif.id)}
          className="flex-shrink-0 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="Mark as read">
          <CheckCheck size={15} />
        </button>
      )}
    </div>
  )
}

export default function NotificationsPage() {
  const { toast } = useToast()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await notificationsAPI.list()
      setNotifications(Array.isArray(data) ? data : data.results ?? [])
    } catch {
      toast('Failed to load notifications', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleRead = async (id) => {
    try {
      await notificationsAPI.markRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch {}
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      toast('All notifications marked as read', 'success')
    } catch {
      toast('Failed to mark notifications', 'error')
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data } = await notificationsAPI.generateAlerts()
      toast(`${data.created} new alerts generated`, 'success')
      load()
    } catch {
      toast('Failed to generate alerts', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read
    if (filter === 'read') return n.is_read
    return true
  })

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Bell size={22} />
            Notifications
            {unreadCount > 0 && (
              <span className="text-sm font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{notifications.length} total notifications</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Scanning...' : 'Scan for Alerts'}
          </button>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <CheckCheck size={14} /> Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {[['all', 'All'], ['unread', 'Unread'], ['read', 'Read']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === val ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse bg-slate-100 rounded-xl h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Bell size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">No notifications</p>
          <p className="text-sm text-slate-400 mt-1">
            {filter === 'unread' ? 'All caught up!' : 'Click "Scan for Alerts" to check for new events.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <NotifItem key={n.id} notif={n} onRead={handleRead} />
          ))}
        </div>
      )}
    </div>
  )
}
