import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, ChevronRight, Phone, Mail,
  MessageSquare, Target, TrendingUp, XCircle, Clock,
  Megaphone, Play, RefreshCw
} from 'lucide-react'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import { crmAPI, currencyAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

const TABS = ['Leads', 'Pipeline', 'Interactions', 'Campaigns']

const INTERACTION_ICONS = {
  call: Phone,
  email: Mail,
  meeting: Users,
  whatsapp: MessageSquare,
  note: MessageSquare,
}

const STAGE_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899',
]

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function zigAmt(usd, rate) {
  if (!usd || !rate) return null
  return (parseFloat(usd) * parseFloat(rate)).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function CRMPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('Leads')

  // Leads state
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState({})
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  // Pipeline state
  const [kanban, setKanban] = useState([])
  const [dealType, setDealType] = useState('sale')
  const [pipelineLoading, setPipelineLoading] = useState(true)

  // Interactions
  const [interactions, setInteractions] = useState([])
  const [interactionsLoading, setInteractionsLoading] = useState(true)
  const [interactionTypeFilter, setInteractionTypeFilter] = useState('')

  // Campaigns
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)

  // Exchange rate
  const [rate, setRate] = useState(13.7)

  // Modals
  const [showAddLead, setShowAddLead] = useState(false)
  const [showLogInteraction, setShowLogInteraction] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showAddCampaign, setShowAddCampaign] = useState(false)

  // Forms
  const [leadForm, setLeadForm] = useState({
    full_name: '', phone: '', email: '', source: 'referral',
    deal_type: 'sale', budget_usd: '', assigned_to: '', next_followup_date: '',
  })
  const [interactionForm, setInteractionForm] = useState({
    type: 'call', summary: '', outcome: '', next_followup_date: '',
  })
  const [campaignForm, setCampaignForm] = useState({
    name: '', campaign_type: 'whatsapp', subject: '', body: '',
  })

  useEffect(() => {
    currencyAPI.latest().then(({ data }) => {
      if (data?.usd_to_zig) setRate(parseFloat(data.usd_to_zig))
    }).catch(() => {})
  }, [])

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      if (sourceFilter) params.source = sourceFilter
      const [leadsRes, statsRes] = await Promise.all([
        crmAPI.leads.list(params),
        crmAPI.leads.stats(),
      ])
      setLeads(leadsRes.data?.results ?? leadsRes.data ?? [])
      setStats(statsRes.data ?? {})
    } catch {
      toast('Failed to load leads', 'error')
    } finally {
      setLeadsLoading(false)
    }
  }, [statusFilter, sourceFilter, toast])

  const loadPipeline = useCallback(async () => {
    setPipelineLoading(true)
    try {
      const { data } = await crmAPI.opportunities.kanban({ deal_type: dealType })
      setKanban(data?.columns ?? data ?? [])
    } catch {
      toast('Failed to load pipeline', 'error')
    } finally {
      setPipelineLoading(false)
    }
  }, [dealType, toast])

  const loadInteractions = useCallback(async () => {
    setInteractionsLoading(true)
    try {
      const params = {}
      if (interactionTypeFilter) params.type = interactionTypeFilter
      const { data } = await crmAPI.interactions.list(params)
      setInteractions(data?.results ?? data ?? [])
    } catch {
      toast('Failed to load interactions', 'error')
    } finally {
      setInteractionsLoading(false)
    }
  }, [interactionTypeFilter, toast])

  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    try {
      const { data } = await crmAPI.campaigns.list()
      setCampaigns(data?.results ?? data ?? [])
    } catch {
      toast('Failed to load campaigns', 'error')
    } finally {
      setCampaignsLoading(false)
    }
  }, [toast])

  useEffect(() => { loadLeads() }, [loadLeads])
  useEffect(() => { if (activeTab === 'Pipeline') loadPipeline() }, [activeTab, loadPipeline])
  useEffect(() => { if (activeTab === 'Interactions') loadInteractions() }, [activeTab, loadInteractions])
  useEffect(() => { if (activeTab === 'Campaigns') loadCampaigns() }, [activeTab, loadCampaigns])

  const handleAdvanceStage = async (lead) => {
    try {
      await crmAPI.leads.advanceStage(lead.id)
      toast('Lead stage advanced', 'success')
      loadLeads()
    } catch {
      toast('Failed to advance stage', 'error')
    }
  }

  const handleConvertToContact = async (lead) => {
    try {
      await crmAPI.leads.convertToContact(lead.id)
      toast('Linked to a sales Contact (existing match reused if found)', 'success')
      loadLeads()
    } catch {
      toast('Failed to convert lead to contact', 'error')
    }
  }

  const handleLogInteraction = async () => {
    if (!selectedLead) return
    try {
      await crmAPI.leads.logInteraction(selectedLead.id, interactionForm)
      toast('Interaction logged', 'success')
      setShowLogInteraction(false)
      setInteractionForm({ type: 'call', summary: '', outcome: '', next_followup_date: '' })
    } catch {
      toast('Failed to log interaction', 'error')
    }
  }

  const handleCreateLead = async () => {
    try {
      await crmAPI.leads.create(leadForm)
      toast('Lead created', 'success')
      setShowAddLead(false)
      setLeadForm({ full_name: '', phone: '', email: '', source: 'referral', deal_type: 'sale', budget_usd: '', assigned_to: '', next_followup_date: '' })
      loadLeads()
    } catch {
      toast('Failed to create lead', 'error')
    }
  }

  const handleCreateCampaign = async () => {
    try {
      await crmAPI.campaigns.create(campaignForm)
      toast('Campaign created', 'success')
      setShowAddCampaign(false)
      loadCampaigns()
    } catch {
      toast('Failed to create campaign', 'error')
    }
  }

  const handleExecuteCampaign = async (campaign) => {
    try {
      await crmAPI.campaigns.execute(campaign.id)
      toast('Campaign executed', 'success')
      loadCampaigns()
    } catch {
      toast('Failed to execute campaign', 'error')
    }
  }

  const leadsColumns = [
    { key: 'full_name', label: 'Name', render: (v, row) => (
      <div>
        <p className="font-medium text-slate-800">{v || row.name || '—'}</p>
        <p className="text-xs text-slate-400">{row.email || ''}</p>
      </div>
    )},
    { key: 'phone', label: 'Phone / WhatsApp', render: (v) => (
      <span className="text-sm text-slate-600">{v || '—'}</span>
    )},
    { key: 'source', label: 'Source', render: (v) => <Badge value={v} /> },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'deal_type', label: 'Deal Type', render: (v) => (
      <span className="text-xs px-2 py-1 bg-slate-100 rounded-full capitalize">{v}</span>
    )},
    { key: 'budget_usd', label: 'Budget', render: (v) => (
      <div>
        <p className="text-sm font-medium">${fmt(v)}</p>
        {v && <p className="text-xs text-slate-400">ZiG {zigAmt(v, rate)}</p>}
      </div>
    )},
    { key: 'assigned_to', label: 'Assigned To', render: (v, row) => (
      <span className="text-sm text-slate-600">{row.assigned_to_name || v || '—'}</span>
    )},
    { key: 'next_followup_date', label: 'Next Follow-up', render: (v) => (
      v ? <span className="text-sm text-slate-600">{new Date(v).toLocaleDateString()}</span> : <span className="text-slate-400">—</span>
    )},
    { key: 'actions', label: 'Actions', render: (_, row) => (
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => handleAdvanceStage(row)}
          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1">
          <ChevronRight size={12} /> Advance
        </button>
        <button onClick={() => { setSelectedLead(row); setShowLogInteraction(true) }}
          className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center gap-1">
          <MessageSquare size={12} /> Log
        </button>
        {row.contact ? (
          <span className="text-xs px-2 py-1 bg-slate-100 text-slate-500 rounded" title={row.contact_name}>
            Linked to Contact
          </span>
        ) : (
          <button onClick={() => handleConvertToContact(row)}
            className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">
            Convert to Contact
          </button>
        )}
      </div>
    )},
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">CRM</h1>
          <p className="text-slate-500 text-sm mt-0.5">Customer Relationship Management — Leads & Pipeline</p>
        </div>
        <button onClick={() => setShowAddLead(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Total Leads" value={stats.total_leads ?? 0} color="blue" />
        <StatCard icon={Plus} label="New" value={stats.new_leads ?? 0} color="indigo" />
        <StatCard icon={Target} label="Qualified" value={stats.qualified ?? 0} color="yellow" />
        <StatCard icon={TrendingUp} label="Won" value={stats.won ?? 0} color="green" />
        <StatCard icon={XCircle} label="Lost" value={stats.lost ?? 0} color="red" />
        <StatCard icon={Clock} label="Follow-ups Today" value={stats.followups_due_today ?? 0} color="orange" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Leads Tab */}
      {activeTab === 'Leads' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="proposal">Proposal</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
              <option value="">All Sources</option>
              <option value="referral">Referral</option>
              <option value="website">Website</option>
              <option value="walk_in">Walk-in</option>
              <option value="social_media">Social Media</option>
              <option value="agent">Agent</option>
              <option value="other">Other</option>
            </select>
            <button onClick={loadLeads}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white hover:bg-slate-50">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <Table columns={leadsColumns} data={leads} loading={leadsLoading} emptyMessage="No leads found" />
          </div>
        </div>
      )}

      {/* Pipeline Tab */}
      {activeTab === 'Pipeline' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={dealType} onChange={e => setDealType(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
              <option value="sale">Sale Pipeline</option>
              <option value="lease">Lease Pipeline</option>
            </select>
          </div>
          {pipelineLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : kanban.length === 0 ? (
            <div className="text-center py-16 text-slate-400">No pipeline data</div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {kanban.map((col, idx) => (
                <div key={col.stage_id ?? col.id ?? idx}
                  className="flex-shrink-0 w-72 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="h-1" style={{ backgroundColor: col.color ?? STAGE_COLORS[idx % STAGE_COLORS.length] }} />
                  <div className="p-4 border-b border-slate-200 bg-white">
                    <p className="font-semibold text-slate-800 text-sm">{col.stage_name ?? col.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-500">{col.count ?? col.opportunities?.length ?? 0} deals</span>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs font-medium text-slate-700">${fmt(col.total_value)}</span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                    {(col.opportunities ?? []).map((opp, oi) => (
                      <div key={opp.id ?? oi} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                        <p className="font-medium text-slate-800 text-sm">{opp.lead_name ?? opp.contact_name ?? '—'}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{opp.property_name ?? opp.property ?? '—'}</p>
                        <div className="mt-2">
                          <p className="text-sm font-semibold text-slate-700">${fmt(opp.expected_value)}</p>
                          <p className="text-xs text-slate-400">ZiG {zigAmt(opp.expected_value, rate)}</p>
                        </div>
                      </div>
                    ))}
                    {!(col.opportunities?.length) && (
                      <p className="text-center text-xs text-slate-400 py-4">No opportunities</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Interactions Tab */}
      {activeTab === 'Interactions' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <select value={interactionTypeFilter} onChange={e => setInteractionTypeFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
              <option value="">All Types</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="note">Note</option>
            </select>
          </div>
          {interactionsLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : interactions.length === 0 ? (
            <div className="text-center py-16 text-slate-400">No interactions yet</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {interactions.map((item, idx) => {
                const Icon = INTERACTION_ICONS[item.type] ?? MessageSquare
                return (
                  <div key={item.id ?? idx} className="flex items-start gap-4 p-4 hover:bg-slate-50">
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Icon size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700 uppercase">{item.type}</span>
                        {item.outcome && <Badge value={item.outcome} />}
                      </div>
                      <p className="text-sm text-slate-700 mt-0.5">{item.summary}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {item.agent_name ?? item.created_by_name ?? 'Agent'} · {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Campaigns Tab */}
      {activeTab === 'Campaigns' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">{campaigns.length} campaigns</p>
            <button onClick={() => setShowAddCampaign(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus size={16} /> New Campaign
            </button>
          </div>
          {campaignsLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map((c, idx) => (
                <div key={c.id ?? idx} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{c.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge value={c.campaign_type ?? c.type} />
                        <Badge value={c.status} />
                      </div>
                    </div>
                    <Megaphone size={20} className="text-slate-300 flex-shrink-0" />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-slate-500">Sent: <strong>{c.sent_count ?? 0}</strong></span>
                    <button onClick={() => handleExecuteCampaign(c)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
                      <Play size={12} /> Execute
                    </button>
                  </div>
                </div>
              ))}
              {campaigns.length === 0 && (
                <div className="col-span-3 text-center py-16 text-slate-400">No campaigns yet</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Lead Modal */}
      <Modal open={showAddLead} onClose={() => setShowAddLead(false)} title="Add New Lead" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
              <input value={leadForm.full_name} onChange={e => setLeadForm(p => ({ ...p, full_name: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Tendai Moyo" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone / WhatsApp</label>
              <input value={leadForm.phone} onChange={e => setLeadForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="+263 77 123 4567" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="tendai@example.co.zw" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
              <select value={leadForm.source} onChange={e => setLeadForm(p => ({ ...p, source: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="referral">Referral</option>
                <option value="website">Website</option>
                <option value="walk_in">Walk-in</option>
                <option value="social_media">Social Media</option>
                <option value="agent">Agent</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deal Type</label>
              <select value={leadForm.deal_type} onChange={e => setLeadForm(p => ({ ...p, deal_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="sale">Sale</option>
                <option value="lease">Lease</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Budget (USD)</label>
              <input type="number" value={leadForm.budget_usd} onChange={e => setLeadForm(p => ({ ...p, budget_usd: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="50000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Assigned To</label>
              <input value={leadForm.assigned_to} onChange={e => setLeadForm(p => ({ ...p, assigned_to: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Agent name or ID" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Next Follow-up</label>
              <input type="date" value={leadForm.next_followup_date} onChange={e => setLeadForm(p => ({ ...p, next_followup_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAddLead(false)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleCreateLead}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Lead</button>
          </div>
        </div>
      </Modal>

      {/* Log Interaction Modal */}
      <Modal open={showLogInteraction} onClose={() => setShowLogInteraction(false)} title={`Log Interaction — ${selectedLead?.full_name ?? selectedLead?.name ?? ''}`} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select value={interactionForm.type} onChange={e => setInteractionForm(p => ({ ...p, type: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="note">Note</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Summary</label>
            <textarea rows={3} value={interactionForm.summary} onChange={e => setInteractionForm(p => ({ ...p, summary: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" placeholder="What was discussed..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
            <input value={interactionForm.outcome} onChange={e => setInteractionForm(p => ({ ...p, outcome: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Interested, Follow up needed" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Next Follow-up Date</label>
            <input type="date" value={interactionForm.next_followup_date} onChange={e => setInteractionForm(p => ({ ...p, next_followup_date: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowLogInteraction(false)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleLogInteraction}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Log Interaction</button>
          </div>
        </div>
      </Modal>

      {/* Add Campaign Modal */}
      <Modal open={showAddCampaign} onClose={() => setShowAddCampaign(false)} title="New Campaign" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Campaign Name</label>
            <input value={campaignForm.name} onChange={e => setCampaignForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Harare Launch Campaign" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select value={campaignForm.campaign_type} onChange={e => setCampaignForm(p => ({ ...p, campaign_type: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
            <input value={campaignForm.subject} onChange={e => setCampaignForm(p => ({ ...p, subject: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Campaign subject" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Body</label>
            <textarea rows={4} value={campaignForm.body} onChange={e => setCampaignForm(p => ({ ...p, body: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" placeholder="Campaign message body..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAddCampaign(false)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleCreateCampaign}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Campaign</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
