import { useState, useEffect, useCallback } from 'react'
import { ShieldAlert, ShieldCheck, AlertTriangle, Users, Download, Plus } from 'lucide-react'
import { amlAPI, usersAPI, salesAPI } from '../services/api'
import { useToast } from '../context/ToastContext'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'

const TABS = ['KYC Profiles', 'Transaction Monitoring']

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1'

const emptyKycForm = {
  subjectKind: 'user', user: '', contact: '',
  full_name: '', id_type: 'national_id', id_number: '', nationality: 'Zimbabwe',
  is_pep: false, pep_details: '', source_of_funds: '',
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

  const [users, setUsers] = useState([])
  const [contacts, setContacts] = useState([])
  const [kycModal, setKycModal] = useState(false)
  const [kycForm, setKycForm] = useState(emptyKycForm)
  const [savingKyc, setSavingKyc] = useState(false)

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

  useEffect(() => {
    if (tab === 'KYC Profiles') fetchProfiles()
    if (tab === 'Transaction Monitoring') fetchTransactions()
  }, [tab, fetchProfiles, fetchTransactions])

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
        nationality: kycForm.nationality, is_pep: kycForm.is_pep, pep_details: kycForm.pep_details,
        source_of_funds: kycForm.source_of_funds,
        user: kycForm.subjectKind === 'user' ? kycForm.user : null,
        contact: kycForm.subjectKind === 'contact' ? kycForm.contact : null,
      }
      await amlAPI.kyc.create(payload)
      toast('KYC profile created', 'success')
      setKycModal(false)
      fetchProfiles()
    } catch (err) {
      toast(err?.response?.data?.non_field_errors?.[0] ?? err?.response?.data?.detail ?? 'Failed to create KYC profile', 'error')
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

  const kycColumns = [
    { key: 'full_name', label: 'Name', render: (v) => <span className="font-medium text-slate-800">{v}</span> },
    { key: 'subject_type', label: 'Subject', render: (v) => <Badge value={v} /> },
    { key: 'id_number', label: 'ID Number' },
    { key: 'nationality', label: 'Nationality' },
    { key: 'is_pep', label: 'PEP', render: (v) => v ? <span className="text-red-600 font-semibold text-xs">YES</span> : '—' },
    { key: 'status', label: 'KYC Status', render: (v) => <Badge value={v} /> },
    { key: 'risk_rating', label: 'Risk', render: (v, row) => <Badge value={v} label={`${v} (${row.risk_score})`} /> },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => (
        <div className="flex gap-1.5">
          {row.status !== 'verified' && (
            <button onClick={() => handleVerify(v)}
              className="text-xs px-2 py-1 rounded-md bg-green-600 text-white hover:bg-green-700">Verify</button>
          )}
          {row.status !== 'rejected' && (
            <button onClick={() => handleReject(v)}
              className="text-xs px-2 py-1 rounded-md bg-red-500 text-white hover:bg-red-600">Reject</button>
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
      </div>

      <Modal open={kycModal} onClose={() => setKycModal(false)} title="New KYC Profile" size="md">
        <form onSubmit={handleCreateKyc} className="space-y-4">
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
            <div className="col-span-2">
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
    </div>
  )
}
