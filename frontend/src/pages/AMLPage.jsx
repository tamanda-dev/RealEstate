import { useState, useEffect, useCallback } from 'react'
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Users, Download, Plus,
  RefreshCw, Building2, Trash2, UserPlus, FileUp, ListChecks,
} from 'lucide-react'
import { amlAPI, usersAPI, salesAPI } from '../services/api'
import { useToast } from '../context/ToastContext'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'
import IdScanner from '../components/IdScanner'

const TABS = ['KYC Profiles', 'Transaction Monitoring', 'Watchlist']

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1'

const emptyKycForm = {
  subjectKind: 'user', user: '', contact: '',
  full_name: '', id_type: 'national_id', id_number: '', date_of_birth: '', nationality: 'Zimbabwe',
  entity_type: 'individual', registration_number: '', residency_status: 'resident',
  is_pep: false, pep_details: '', source_of_funds: '',
}

const emptyOwnerForm = {
  full_name: '', id_type: 'national_id', id_number: '', nationality: 'Zimbabwe',
  date_of_birth: '', ownership_percentage: '', is_pep: false,
}

const emptyWatchlistForm = {
  full_name: '', aliases: '', list_source: 'other', entry_type: 'sanction', country: '', date_of_birth: '', notes: '',
}

export default function AMLPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState('KYC Profiles')

  const [profiles, setProfiles] = useState([])
  const [kycStats, setKycStats] = useState(null)
  const [profilesLoading, setProfilesLoading] = useState(false)

  const [transactions, setTransactions] = useState([])
  const [txnStats, setTxnStats] = useState(null)
  const [transactionsLoading, setTransactionsLoading] = useState(false)

  const [watchlist, setWatchlist] = useState([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)

  const [users, setUsers] = useState([])
  const [contacts, setContacts] = useState([])
  const [kycModal, setKycModal] = useState(false)
  const [kycForm, setKycForm] = useState(emptyKycForm)
  const [savingKyc, setSavingKyc] = useState(false)

  const [ownersModal, setOwnersModal] = useState(false)
  const [ownersProfile, setOwnersProfile] = useState(null)
  const [owners, setOwners] = useState([])
  const [ownersLoading, setOwnersLoading] = useState(false)
  const [ownerForm, setOwnerForm] = useState(emptyOwnerForm)
  const [savingOwner, setSavingOwner] = useState(false)

  const [watchlistModal, setWatchlistModal] = useState(false)
  const [watchlistForm, setWatchlistForm] = useState(emptyWatchlistForm)
  const [savingWatchlist, setSavingWatchlist] = useState(false)
  const [importingCsv, setImportingCsv] = useState(false)

  const fetchProfiles = useCallback(async () => {
    setProfilesLoading(true)
    try {
      const [pRes, sRes] = await Promise.all([amlAPI.kyc.list(), amlAPI.kyc.stats()])
      setProfiles(Array.isArray(pRes.data) ? pRes.data : pRes.data?.results ?? [])
      setKycStats(sRes.data)
    } catch {
      toast('Failed to load KYC profiles', 'error')
    } finally {
      setProfilesLoading(false)
    }
  }, [toast])

  const fetchTransactions = useCallback(async () => {
    setTransactionsLoading(true)
    try {
      const [tRes, sRes] = await Promise.all([amlAPI.monitoredTransactions.list(), amlAPI.monitoredTransactions.stats()])
      setTransactions(Array.isArray(tRes.data) ? tRes.data : tRes.data?.results ?? [])
      setTxnStats(sRes.data)
    } catch {
      toast('Failed to load monitored transactions', 'error')
    } finally {
      setTransactionsLoading(false)
    }
  }, [toast])

  const fetchWatchlist = useCallback(async () => {
    setWatchlistLoading(true)
    try {
      const res = await amlAPI.watchlist.list()
      setWatchlist(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast('Failed to load watchlist entries', 'error')
    } finally {
      setWatchlistLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (tab === 'KYC Profiles') fetchProfiles()
    if (tab === 'Transaction Monitoring') fetchTransactions()
    if (tab === 'Watchlist') fetchWatchlist()
  }, [tab, fetchProfiles, fetchTransactions, fetchWatchlist])

  const openKycModal = async () => {
    setKycForm(emptyKycForm)
    setKycModal(true)
    try {
      const [uRes, cRes] = await Promise.all([usersAPI.list({ page_size: 200 }), salesAPI.contacts.list({ page_size: 200 })])
      setUsers(Array.isArray(uRes.data) ? uRes.data : uRes.data?.results ?? [])
      setContacts(Array.isArray(cRes.data) ? cRes.data : cRes.data?.results ?? [])
    } catch { /* dropdowns just stay empty if this fails */ }
  }

  const handleCreateKyc = async (e) => {
    e.preventDefault()
    setSavingKyc(true)
    try {
      const payload = {
        full_name: kycForm.full_name, id_type: kycForm.id_type, id_number: kycForm.id_number,
        date_of_birth: kycForm.date_of_birth || null,
        nationality: kycForm.nationality, is_pep: kycForm.is_pep, pep_details: kycForm.pep_details,
        source_of_funds: kycForm.source_of_funds,
        entity_type: kycForm.entity_type,
        registration_number: kycForm.registration_number,
        residency_status: kycForm.residency_status,
        user: kycForm.subjectKind === 'user' ? kycForm.user : null,
        contact: kycForm.subjectKind === 'contact' ? kycForm.contact : null,
      }
      const res = await amlAPI.kyc.create(payload)
      toast('KYC profile created', 'success')
      setKycModal(false)
      fetchProfiles()
      // Entity buyers (trust/company) need their beneficial owners captured for CDD —
      // jump straight into that instead of making staff hunt for the button afterward.
      if (kycForm.entity_type !== 'individual') {
        openOwnersModal(res.data)
      }
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      toast((Array.isArray(firstError) ? firstError[0] : firstError) ?? data?.detail ?? 'Failed to create KYC profile', 'error')
    } finally {
      setSavingKyc(false)
    }
  }

  const handleVerify = async (id) => {
    try {
      await amlAPI.kyc.verify(id, 1)
      toast('Profile verified', 'success')
      fetchProfiles()
    } catch {
      toast('Failed to verify profile', 'error')
    }
  }

  const handleReject = async (id) => {
    try {
      await amlAPI.kyc.reject(id)
      toast('Profile rejected', 'success')
      fetchProfiles()
    } catch {
      toast('Failed to reject profile', 'error')
    }
  }

  const handleRescreen = async (id) => {
    try {
      const res = await amlAPI.kyc.screenWatchlist(id)
      const n = res.data?.matches?.length ?? 0
      toast(n ? `${n} watchlist match(es) found` : 'No watchlist matches found', n ? 'error' : 'success')
      fetchProfiles()
    } catch {
      toast('Failed to re-screen profile', 'error')
    }
  }

  const openOwnersModal = async (profile) => {
    setOwnersProfile(profile)
    setOwnerForm(emptyOwnerForm)
    setOwnersModal(true)
    setOwnersLoading(true)
    try {
      const res = await amlAPI.beneficialOwners.list({ kyc_profile: profile.id })
      setOwners(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      toast('Failed to load beneficial owners', 'error')
    } finally {
      setOwnersLoading(false)
    }
  }

  const handleAddOwner = async (e) => {
    e.preventDefault()
    setSavingOwner(true)
    try {
      await amlAPI.beneficialOwners.create({
        ...ownerForm, date_of_birth: ownerForm.date_of_birth || null, kyc_profile: ownersProfile.id,
      })
      toast('Beneficial owner added', 'success')
      setOwnerForm(emptyOwnerForm)
      const res = await amlAPI.beneficialOwners.list({ kyc_profile: ownersProfile.id })
      setOwners(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
      fetchProfiles()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null
      toast((Array.isArray(firstError) ? firstError[0] : firstError) ?? 'Failed to add beneficial owner', 'error')
    } finally {
      setSavingOwner(false)
    }
  }

  const handleDeleteOwner = async (id) => {
    if (!window.confirm('Remove this beneficial owner?')) return
    try {
      await amlAPI.beneficialOwners.delete(id)
      setOwners((prev) => prev.filter((o) => o.id !== id))
      fetchProfiles()
    } catch {
      toast('Failed to remove beneficial owner', 'error')
    }
  }

  const handleClearTxn = async (id) => {
    try {
      await amlAPI.monitoredTransactions.clear(id, '')
      toast('Transaction cleared', 'success')
      fetchTransactions()
    } catch {
      toast('Failed to clear transaction', 'error')
    }
  }

  const handleReportToFiu = async (id) => {
    if (!window.confirm('Mark this transaction as reported to the FIU via goAML?')) return
    try {
      await amlAPI.monitoredTransactions.reportToFiu(id, '')
      toast('Marked as reported to FIU', 'success')
      fetchTransactions()
    } catch {
      toast('Failed to update transaction', 'error')
    }
  }

  const handleDownloadGoAml = async (id) => {
    try {
      const res = await amlAPI.monitoredTransactions.goamlExport(id)
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `goaml_str_${id}.xml`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast('Failed to download goAML export', 'error')
    }
  }

  const handleAddWatchlistEntry = async (e) => {
    e.preventDefault()
    setSavingWatchlist(true)
    try {
      await amlAPI.watchlist.create({ ...watchlistForm, date_of_birth: watchlistForm.date_of_birth || null })
      toast('Watchlist entry added', 'success')
      setWatchlistForm(emptyWatchlistForm)
      setWatchlistModal(false)
      fetchWatchlist()
    } catch (err) {
      toast(err?.response?.data?.full_name?.[0] ?? 'Failed to add watchlist entry', 'error')
    } finally {
      setSavingWatchlist(false)
    }
  }

  const handleDeleteWatchlistEntry = async (id) => {
    if (!window.confirm('Remove this watchlist entry?')) return
    try {
      await amlAPI.watchlist.delete(id)
      setWatchlist((prev) => prev.filter((w) => w.id !== id))
    } catch {
      toast('Failed to remove watchlist entry', 'error')
    }
  }

  const handleImportCsv = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportingCsv(true)
    try {
      const res = await amlAPI.watchlist.importCsv(file)
      toast(`Imported ${res.data.imported} watchlist entries`, 'success')
      fetchWatchlist()
    } catch (err) {
      toast(err?.response?.data?.error ?? 'CSV import failed', 'error')
    } finally {
      setImportingCsv(false)
      e.target.value = ''
    }
  }

  const kycColumns = [
    { key: 'full_name', label: 'Name', render: (v) => <span className="font-medium text-slate-800">{v}</span> },
    { key: 'subject_type', label: 'Subject', render: (v) => <Badge value={v} /> },
    {
      key: 'entity_type', label: 'Entity', render: (v) => v !== 'individual'
        ? <span className="flex items-center gap-1 text-xs text-slate-600"><Building2 size={12} /> {v}</span>
        : 'Individual',
    },
    { key: 'id_number', label: 'ID Number' },
    { key: 'residency_status', label: 'Residency', render: (v) => <Badge value={v} /> },
    { key: 'is_pep', label: 'PEP', render: (v) => v ? <span className="text-red-600 font-semibold text-xs">YES</span> : '—' },
    {
      key: 'watchlist_matches', label: 'Watchlist', render: (v) => (v && v.length)
        ? <span className="text-xs font-semibold text-red-600">{v.length} match{v.length > 1 ? 'es' : ''}</span>
        : <span className="text-xs text-slate-400">clear</span>,
    },
    { key: 'status', label: 'KYC Status', render: (v) => <Badge value={v} /> },
    { key: 'risk_rating', label: 'Risk', render: (v, row) => <Badge value={v} label={`${v} (${row.risk_score})`} /> },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => (
        <div className="flex gap-1.5 flex-wrap">
          {row.status !== 'verified' && (
            <button onClick={() => handleVerify(v)}
              className="text-xs px-2 py-1 rounded-md bg-green-600 text-white hover:bg-green-700">Verify</button>
          )}
          {row.status !== 'rejected' && (
            <button onClick={() => handleReject(v)}
              className="text-xs px-2 py-1 rounded-md bg-red-500 text-white hover:bg-red-600">Reject</button>
          )}
          <button onClick={() => handleRescreen(v)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-600 text-white hover:bg-slate-700">
            <RefreshCw size={11} /> Screen
          </button>
          {row.entity_type !== 'individual' && (
            <button onClick={() => openOwnersModal(row)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">
              <UserPlus size={11} /> Owners
            </button>
          )}
        </div>
      ),
    },
  ]

  const txnColumns = [
    { key: 'transaction_date', label: 'Date' },
    { key: 'subject_name', label: 'Subject', render: (v) => v || '—' },
    { key: 'source_type', label: 'Source', render: (v) => <Badge value={v} /> },
    { key: 'amount', label: 'Amount', render: (v, row) => `${row.currency} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { key: 'flags', label: 'Flags', render: (v) => (
      <div className="flex flex-wrap gap-1">{(v ?? []).map((f) => <Badge key={f} value={f} />)}</div>
    ) },
    { key: 'risk_level', label: 'Risk Level', render: (v) => <Badge value={v} /> },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => (
        <div className="flex gap-1.5 flex-wrap">
          {row.status === 'flagged' && (
            <button onClick={() => handleClearTxn(v)}
              className="text-xs px-2 py-1 rounded-md bg-slate-600 text-white hover:bg-slate-700">Clear</button>
          )}
          {row.status !== 'reported' && (
            <button onClick={() => handleReportToFiu(v)}
              className="text-xs px-2 py-1 rounded-md bg-red-600 text-white hover:bg-red-700">Report to FIU</button>
          )}
          <button onClick={() => handleDownloadGoAml(v)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            <Download size={11} /> goAML XML
          </button>
        </div>
      ),
    },
  ]

  const watchlistColumns = [
    { key: 'full_name', label: 'Name', render: (v) => <span className="font-medium text-slate-800">{v}</span> },
    { key: 'aliases', label: 'Aliases', render: (v) => <span className="text-xs text-slate-500 whitespace-pre-line">{v || '—'}</span> },
    { key: 'list_source', label: 'Source', render: (v) => <Badge value={v} /> },
    { key: 'entry_type', label: 'Type', render: (v) => <Badge value={v} /> },
    { key: 'country', label: 'Country', render: (v) => v || '—' },
    { key: 'is_active', label: 'Active', render: (v) => v ? <ShieldCheck size={14} className="text-green-600" /> : <span className="text-xs text-slate-400">inactive</span> },
    {
      key: 'id', label: 'Actions',
      render: (v) => (
        <button onClick={() => handleDeleteWatchlistEntry(v)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-red-500 text-white hover:bg-red-600">
          <Trash2 size={11} /> Remove
        </button>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Anti-Money Laundering (AML)</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            KYC verification, risk scoring, transaction monitoring, and goAML/FIU reporting
          </p>
        </div>
        {tab === 'KYC Profiles' && (
          <button onClick={openKycModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> New KYC Profile
          </button>
        )}
        {tab === 'Watchlist' && (
          <div className="flex gap-2">
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
              <FileUp size={16} /> {importingCsv ? 'Importing…' : 'Import CSV'}
              <input type="file" accept=".csv" className="hidden" disabled={importingCsv} onChange={handleImportCsv} />
            </label>
            <button onClick={() => { setWatchlistForm(emptyWatchlistForm); setWatchlistModal(true) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              <Plus size={16} /> Add Entry
            </button>
          </div>
        )}
      </div>

      {tab === 'KYC Profiles' && kycStats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard icon={Users} label="Total Profiles" value={kycStats.total_profiles} color="blue" />
          <StatCard icon={ShieldCheck} label="Verified" value={kycStats.verified} color="green" />
          <StatCard icon={ShieldAlert} label="Pending" value={kycStats.pending} color="yellow" />
          <StatCard icon={AlertTriangle} label="PEPs" value={kycStats.pep_count} color="orange" />
          <StatCard icon={AlertTriangle} label="High/Critical Risk" value={kycStats.high_or_critical_risk} color="red" />
        </div>
      )}

      {tab === 'Transaction Monitoring' && txnStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={ShieldAlert} label="Flagged (Pending)" value={txnStats.total_flagged} color="orange" />
          <StatCard icon={ShieldCheck} label="Cleared" value={txnStats.cleared} color="green" />
          <StatCard icon={AlertTriangle} label="Reported to FIU" value={txnStats.reported} color="red" />
          <StatCard icon={AlertTriangle} label="Flagged Amount" value={`$${Number(txnStats.total_flagged_amount).toLocaleString()}`} color="blue" />
        </div>
      )}

      {tab === 'Watchlist' && (
        <div className="flex items-start gap-2 mb-6 p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
          <ListChecks size={15} className="shrink-0 mt-0.5" />
          <span>
            Local sanctions/PEP list used for fuzzy-name screening — there is no live connection to a
            commercial screening provider. Keep this current via CSV import from public sources
            (OFAC SDN, UN Consolidated List) or manual entries for local PEPs.
          </span>
        </div>
      )}

      <div className="flex border-b border-gray-200 mb-6 gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {tab === 'KYC Profiles' && (
          <Table columns={kycColumns} data={profiles} loading={profilesLoading} emptyMessage="No KYC profiles recorded." />
        )}
        {tab === 'Transaction Monitoring' && (
          <Table columns={txnColumns} data={transactions} loading={transactionsLoading} emptyMessage="No transactions have been flagged." />
        )}
        {tab === 'Watchlist' && (
          <Table columns={watchlistColumns} data={watchlist} loading={watchlistLoading} emptyMessage="No watchlist entries loaded yet." />
        )}
      </div>

      <Modal open={kycModal} onClose={() => setKycModal(false)} title="New KYC Profile" size="lg">
        <form onSubmit={handleCreateKyc} className="space-y-4">
          <IdScanner onExtracted={(fields) => setKycForm((f) => ({
            ...f,
            full_name: fields.full_name || f.full_name,
            id_number: fields.id_number || f.id_number,
            date_of_birth: fields.date_of_birth || f.date_of_birth,
          }))} />

          <div>
            <label className={labelCls}>Subject Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={kycForm.subjectKind === 'user'}
                  onChange={() => setKycForm((f) => ({ ...f, subjectKind: 'user', contact: '' }))} />
                Platform User (tenant/landlord/buyer account)
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={kycForm.subjectKind === 'contact'}
                  onChange={() => setKycForm((f) => ({ ...f, subjectKind: 'contact', user: '' }))} />
                Sales Contact (no platform login)
              </label>
            </div>
          </div>

          {kycForm.subjectKind === 'user' ? (
            <div>
              <label className={labelCls}>User *</label>
              <select required className={inputCls} value={kycForm.user}
                onChange={(e) => {
                  const u = users.find((x) => String(x.id) === e.target.value)
                  setKycForm((f) => ({ ...f, user: e.target.value, full_name: u ? (u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username) : f.full_name }))
                }}>
                <option value="">Select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Sales Contact *</label>
              <select required className={inputCls} value={kycForm.contact}
                onChange={(e) => {
                  const c = contacts.find((x) => String(x.id) === e.target.value)
                  setKycForm((f) => ({ ...f, contact: e.target.value, full_name: c ? c.full_name : f.full_name }))
                }}>
                <option value="">Select contact…</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.contact_type})</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Full Name *</label>
            <input required className={inputCls} value={kycForm.full_name}
              onChange={(e) => setKycForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Entity Type</label>
              <select className={inputCls} value={kycForm.entity_type}
                onChange={(e) => setKycForm((f) => ({ ...f, entity_type: e.target.value }))}>
                <option value="individual">Individual</option>
                <option value="trust">Trust</option>
                <option value="company">Company / Corporate</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Residency Status</label>
              <select className={inputCls} value={kycForm.residency_status}
                onChange={(e) => setKycForm((f) => ({ ...f, residency_status: e.target.value }))}>
                <option value="resident">Resident</option>
                <option value="non_resident">Non-Resident</option>
              </select>
            </div>
          </div>

          {kycForm.entity_type !== 'individual' && (
            <div>
              <label className={labelCls}>Registration Number *</label>
              <input required className={inputCls} value={kycForm.registration_number}
                onChange={(e) => setKycForm((f) => ({ ...f, registration_number: e.target.value }))}
                placeholder="Trust/company registration number" />
              <p className="text-xs text-slate-500 mt-1">
                You'll be able to add beneficial owners right after saving this profile.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>ID Type</label>
              <select className={inputCls} value={kycForm.id_type}
                onChange={(e) => setKycForm((f) => ({ ...f, id_type: e.target.value }))}>
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's License</option>
                <option value="company_reg">Company Registration</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>ID Number *</label>
              <input required className={inputCls} value={kycForm.id_number}
                onChange={(e) => setKycForm((f) => ({ ...f, id_number: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" className={inputCls} value={kycForm.date_of_birth}
                onChange={(e) => setKycForm((f) => ({ ...f, date_of_birth: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Nationality</label>
              <input className={inputCls} value={kycForm.nationality}
                onChange={(e) => setKycForm((f) => ({ ...f, nationality: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="ispep" checked={kycForm.is_pep}
              onChange={(e) => setKycForm((f) => ({ ...f, is_pep: e.target.checked }))} className="rounded" />
            <label htmlFor="ispep" className="text-sm text-slate-700">Politically Exposed Person (PEP)</label>
          </div>
          {kycForm.is_pep && (
            <div>
              <label className={labelCls}>PEP Details</label>
              <textarea rows={2} className={inputCls} value={kycForm.pep_details}
                onChange={(e) => setKycForm((f) => ({ ...f, pep_details: e.target.value }))}
                placeholder="Position held, relationship to public office, etc." />
            </div>
          )}
          <div>
            <label className={labelCls}>Source of Funds</label>
            <textarea rows={2} className={inputCls} value={kycForm.source_of_funds}
              onChange={(e) => setKycForm((f) => ({ ...f, source_of_funds: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setKycModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingKyc}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {savingKyc ? 'Saving...' : 'Create Profile'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={ownersModal} onClose={() => setOwnersModal(false)}
        title={`Beneficial Owners — ${ownersProfile?.full_name ?? ''}`} size="lg">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Natural persons who ultimately own or control this entity. goAML/FATF require these on
            file for every trust/company buyer, alongside their percentage ownership.
          </p>

          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            {ownersLoading ? (
              <div className="p-4 text-sm text-slate-400">Loading…</div>
            ) : owners.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">No beneficial owners added yet.</div>
            ) : owners.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                    {o.full_name}
                    {o.is_pep && <span className="text-red-600 text-xs font-semibold">PEP</span>}
                    {o.watchlist_matches?.length > 0 && (
                      <span className="text-xs font-semibold text-red-600">{o.watchlist_matches.length} watchlist match</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{o.id_number} · {o.ownership_percentage}% ownership</div>
                </div>
                <button onClick={() => handleDeleteOwner(o.id)}
                  className="text-xs px-2 py-1 rounded-md bg-red-500 text-white hover:bg-red-600 flex items-center gap-1">
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddOwner} className="space-y-3 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Full Name *</label>
                <input required className={inputCls} value={ownerForm.full_name}
                  onChange={(e) => setOwnerForm((f) => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>ID Type</label>
                <select className={inputCls} value={ownerForm.id_type}
                  onChange={(e) => setOwnerForm((f) => ({ ...f, id_type: e.target.value }))}>
                  <option value="national_id">National ID</option>
                  <option value="passport">Passport</option>
                  <option value="drivers_license">Driver's License</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>ID Number *</label>
                <input required className={inputCls} value={ownerForm.id_number}
                  onChange={(e) => setOwnerForm((f) => ({ ...f, id_number: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Nationality</label>
                <input className={inputCls} value={ownerForm.nationality}
                  onChange={(e) => setOwnerForm((f) => ({ ...f, nationality: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Ownership % *</label>
                <input required type="number" step="0.01" min="0" max="100" className={inputCls}
                  value={ownerForm.ownership_percentage}
                  onChange={(e) => setOwnerForm((f) => ({ ...f, ownership_percentage: e.target.value }))} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="ownerpep" checked={ownerForm.is_pep}
                  onChange={(e) => setOwnerForm((f) => ({ ...f, is_pep: e.target.checked }))} className="rounded" />
                <label htmlFor="ownerpep" className="text-sm text-slate-700">Politically Exposed Person (PEP)</label>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={savingOwner}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                <UserPlus size={14} /> {savingOwner ? 'Adding…' : 'Add Owner'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal open={watchlistModal} onClose={() => setWatchlistModal(false)} title="Add Watchlist Entry" size="md">
        <form onSubmit={handleAddWatchlistEntry} className="space-y-4">
          <div>
            <label className={labelCls}>Full Name *</label>
            <input required className={inputCls} value={watchlistForm.full_name}
              onChange={(e) => setWatchlistForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Aliases (one per line)</label>
            <textarea rows={2} className={inputCls} value={watchlistForm.aliases}
              onChange={(e) => setWatchlistForm((f) => ({ ...f, aliases: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>List Source</label>
              <select className={inputCls} value={watchlistForm.list_source}
                onChange={(e) => setWatchlistForm((f) => ({ ...f, list_source: e.target.value }))}>
                <option value="ofac_sdn">OFAC SDN List</option>
                <option value="un_consolidated">UN Security Council Consolidated List</option>
                <option value="local_pep">Local PEP List</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Entry Type</label>
              <select className={inputCls} value={watchlistForm.entry_type}
                onChange={(e) => setWatchlistForm((f) => ({ ...f, entry_type: e.target.value }))}>
                <option value="sanction">Sanctioned Entity/Individual</option>
                <option value="pep">Politically Exposed Person</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <input className={inputCls} value={watchlistForm.country}
                onChange={(e) => setWatchlistForm((f) => ({ ...f, country: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" className={inputCls} value={watchlistForm.date_of_birth}
                onChange={(e) => setWatchlistForm((f) => ({ ...f, date_of_birth: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} className={inputCls} value={watchlistForm.notes}
              onChange={(e) => setWatchlistForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setWatchlistModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingWatchlist}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {savingWatchlist ? 'Saving...' : 'Add Entry'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
