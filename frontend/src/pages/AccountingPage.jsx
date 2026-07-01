import { useState, useEffect } from 'react'
import { BookOpen, Plus, AlertTriangle, DollarSign } from 'lucide-react'
import { accountingAPI } from '../services/api'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import Table from '../components/Table'

const TABS = ['Chart of Accounts', 'Journal Entries', 'Trust Accounting', 'Reconciliation', 'Audit Trail']

export default function AccountingPage() {
  const [tab, setTab] = useState('Chart of Accounts')
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState(null)
  const [journalEntries, setJournalEntries] = useState([])
  const [trustTransactions, setTrustTransactions] = useState([])
  const [reconciliations, setReconciliations] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [accountModal, setAccountModal] = useState(false)
  const [accountForm, setAccountForm] = useState({ name: '', code: '', account_type: 'asset', subtype: '', description: '' })
  const [savingAccount, setSavingAccount] = useState(false)

  const fetchAccounts = async () => {
    setLoading(true)
    setError('')
    try {
      const [accRes, balRes] = await Promise.allSettled([
        accountingAPI.accounts.list(),
        accountingAPI.accounts.balances(),
      ])
      if (accRes.status === 'fulfilled') {
        const d = accRes.value.data
        setAccounts(Array.isArray(d) ? d : d.results ?? [])
      }
      if (balRes.status === 'fulfilled') setBalances(balRes.value.data)
    } catch {
      setError('Failed to load accounts.')
    } finally {
      setLoading(false)
    }
  }

  const fetchJournalEntries = async () => {
    try {
      const { data } = await accountingAPI.journalEntries.list()
      setJournalEntries(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchTrustTransactions = async () => {
    try {
      const { data } = await accountingAPI.trustTransactions.list()
      setTrustTransactions(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchReconciliations = async () => {
    try {
      const { data } = await accountingAPI.reconciliations.list()
      setReconciliations(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const fetchAuditLogs = async () => {
    try {
      const { data } = await accountingAPI.auditLogs.list()
      setAuditLogs(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  useEffect(() => { fetchAccounts() }, [])
  useEffect(() => {
    if (tab === 'Journal Entries') fetchJournalEntries()
    if (tab === 'Trust Accounting') fetchTrustTransactions()
    if (tab === 'Reconciliation') fetchReconciliations()
    if (tab === 'Audit Trail') fetchAuditLogs()
  }, [tab])

  const handlePostEntry = async (id) => {
    try {
      await accountingAPI.journalEntries.post(id)
      fetchJournalEntries()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to post entry.')
    }
  }

  const handleVoidEntry = async (id) => {
    if (!window.confirm('Void this journal entry?')) return
    try {
      await accountingAPI.journalEntries.void(id)
      fetchJournalEntries()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to void entry.')
    }
  }

  const handleReconcile = async (id) => {
    try {
      await accountingAPI.reconciliations.reconcile(id, {})
      fetchReconciliations()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to reconcile.')
    }
  }

  const handleAddAccount = async (e) => {
    e.preventDefault()
    setSavingAccount(true)
    try {
      await accountingAPI.accounts.create(accountForm)
      setAccountModal(false)
      setAccountForm({ name: '', code: '', account_type: 'asset', subtype: '', description: '' })
      fetchAccounts()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to create account.')
    } finally {
      setSavingAccount(false)
    }
  }

  const fmtCurrency = (v) => v != null ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
  const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—'

  const accountColumns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Account Name' },
    { key: 'account_type', label: 'Type', render: (v) => <Badge value={v} /> },
    { key: 'subtype', label: 'Subtype', render: (v) => v ?? '—' },
    { key: 'balance', label: 'Balance', render: (v) => fmtCurrency(v) },
    { key: 'is_active', label: 'Active', render: (v) => <Badge value={v ? 'active' : 'inactive'} /> },
  ]

  const jeColumns = [
    { key: 'reference', label: 'Reference', render: (v, row) => v ?? `JE-${row.id}` },
    { key: 'description', label: 'Description', render: (v) => v ?? '—' },
    { key: 'date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'total_debit', label: 'Debit', render: (v) => fmtCurrency(v) },
    { key: 'total_credit', label: 'Credit', render: (v) => fmtCurrency(v) },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => (
        <div className="flex gap-1.5">
          {row.status === 'draft' && (
            <button onClick={() => handlePostEntry(v)}
              className="text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">Post</button>
          )}
          {row.status === 'posted' && (
            <button onClick={() => handleVoidEntry(v)}
              className="text-xs px-2 py-1 rounded-md bg-red-500 text-white hover:bg-red-600">Void</button>
          )}
        </div>
      )
    },
  ]

  const trustColumns = [
    { key: 'transaction_type', label: 'Type', render: (v) => v?.replace(/_/g, ' ') ?? '—' },
    { key: 'amount', label: 'Amount', render: (v) => fmtCurrency(v) },
    { key: 'description', label: 'Description', render: (v) => v ?? '—' },
    { key: 'transaction_date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'is_reconciled', label: 'Reconciled', render: (v) => <Badge value={v ? 'reconciled' : 'pending'} /> },
    { key: 'reference', label: 'Reference', render: (v) => v ?? '—' },
  ]

  const reconcileColumns = [
    { key: 'account_name', label: 'Account', render: (v, row) => v ?? row.account ?? '—' },
    { key: 'statement_balance', label: 'Statement Balance', render: (v) => fmtCurrency(v) },
    { key: 'book_balance', label: 'Book Balance', render: (v) => fmtCurrency(v) },
    { key: 'difference', label: 'Difference', render: (v) => fmtCurrency(v) },
    { key: 'status', label: 'Status', render: (v) => <Badge value={v} /> },
    { key: 'reconciliation_date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      key: 'id', label: 'Action',
      render: (v, row) => row.status !== 'reconciled' ? (
        <button onClick={() => handleReconcile(v)}
          className="text-xs px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700">Reconcile</button>
      ) : <span className="text-green-600 text-xs">Done</span>
    },
  ]

  const auditColumns = [
    { key: 'action', label: 'Action' },
    { key: 'model_name', label: 'Module', render: (v) => v ?? '—' },
    { key: 'user_name', label: 'User', render: (v, row) => v ?? row.user ?? '—' },
    { key: 'description', label: 'Description', render: (v) => v ?? '—' },
    { key: 'timestamp', label: 'Timestamp', render: (v) => fmtDate(v) },
    { key: 'ip_address', label: 'IP', render: (v) => v ?? '—' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Accounting</h1>
          <p className="text-gray-500 text-sm mt-0.5">Chart of accounts, journals, trust & audit trail</p>
        </div>
        {tab === 'Chart of Accounts' && (
          <button onClick={() => setAccountModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Add Account
          </button>
        )}
      </div>

      {/* Balance summary cards */}
      {balances && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Assets', value: balances.total_assets ?? balances.assets, color: 'blue' },
            { label: 'Liabilities', value: balances.total_liabilities ?? balances.liabilities, color: 'red' },
            { label: 'Revenue', value: balances.total_revenue ?? balances.revenue, color: 'green' },
            { label: 'Expenses', value: balances.total_expenses ?? balances.expenses, color: 'orange' },
            { label: 'Trust Balance', value: balances.trust_balance, color: 'purple' },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtCurrency(item.value)}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Tabs */}
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
        {tab === 'Chart of Accounts' && (
          <Table columns={accountColumns} data={accounts} loading={loading} emptyMessage="No accounts found." />
        )}
        {tab === 'Journal Entries' && (
          <Table columns={jeColumns} data={journalEntries} loading={false} emptyMessage="No journal entries." />
        )}
        {tab === 'Trust Accounting' && (
          <Table columns={trustColumns} data={trustTransactions} loading={false} emptyMessage="No trust transactions." />
        )}
        {tab === 'Reconciliation' && (
          <Table columns={reconcileColumns} data={reconciliations} loading={false} emptyMessage="No reconciliations." />
        )}
        {tab === 'Audit Trail' && (
          <Table columns={auditColumns} data={auditLogs} loading={false} emptyMessage="No audit log entries." />
        )}
      </div>

      {/* Add Account Modal */}
      <Modal open={accountModal} onClose={() => setAccountModal(false)} title="Add Account">
        <form onSubmit={handleAddAccount} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
              <input required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Code *</label>
              <input required value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })}
                placeholder="e.g. 1001"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={accountForm.account_type} onChange={(e) => setAccountForm({ ...accountForm, account_type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {['asset', 'liability', 'equity', 'revenue', 'expense'].map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtype</label>
              <input value={accountForm.subtype} onChange={(e) => setAccountForm({ ...accountForm, subtype: e.target.value })}
                placeholder="e.g. current, fixed"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea rows={2} value={accountForm.description} onChange={(e) => setAccountForm({ ...accountForm, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setAccountModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingAccount}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {savingAccount ? 'Saving...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
