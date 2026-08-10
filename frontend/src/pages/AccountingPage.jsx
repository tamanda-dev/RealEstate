import { useState, useEffect, useCallback } from 'react'
import { Plus, AlertTriangle, Upload, RefreshCw } from 'lucide-react'
import { accountingAPI, reportsAPI } from '../services/api'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Table from '../components/Table'

const TABS = ['Chart of Accounts', 'Journal Entries', 'Trust Accounting', 'Reconciliation',
              'Receipts', 'Cashbook', 'Trial Balance', 'Balance Sheet', 'Audit Trail']

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
  const [accountForm, setAccountForm] = useState({ name: '', account_number: '', account_type: 'asset', subtype: 'other', description: '' })
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

  // ── Receipts ──────────────────────────────────────────────────────────────
  const [receipts, setReceipts] = useState([])
  const [receiptModal, setReceiptModal] = useState(false)
  const [viewReceipt, setViewReceipt] = useState(null)
  const [receiptForm, setReceiptForm] = useState({
    payer_name: '', amount: '', currency: 'USD', payment_method: '',
    reference: '', description: '', received_date: new Date().toISOString().split('T')[0],
  })
  const [savingReceipt, setSavingReceipt] = useState(false)

  const fetchReceipts = async () => {
    try {
      const { data } = await accountingAPI.receipts.list()
      setReceipts(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  const handleAddReceipt = async (e) => {
    e.preventDefault()
    setSavingReceipt(true)
    try {
      await accountingAPI.receipts.create({ ...receiptForm, source_type: 'other' })
      setReceiptModal(false)
      setReceiptForm({ payer_name: '', amount: '', currency: 'USD', payment_method: '',
                       reference: '', description: '', received_date: new Date().toISOString().split('T')[0] })
      fetchReceipts()
    } catch (err) {
      alert(err?.response?.data?.detail ?? 'Failed to record receipt.')
    } finally {
      setSavingReceipt(false)
    }
  }

  const receiptColumns = [
    { key: 'receipt_number', label: 'Receipt #', render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: 'received_date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'payer_name', label: 'Payer' },
    { key: 'source_type', label: 'Source', render: (v) => <Badge value={v} /> },
    { key: 'amount', label: 'Amount', render: (v, row) => `${row.currency ?? 'USD'} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { key: 'payment_method', label: 'Method', render: (v) => v?.replace(/_/g, ' ') || '—' },
    {
      key: 'id', label: 'Action',
      render: (v, row) => (
        <button onClick={() => setViewReceipt(row)}
          className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-white hover:bg-slate-900">View / Print</button>
      ),
    },
  ]

  // ── Cashbook ──────────────────────────────────────────────────────────────
  const [cashbookAccount, setCashbookAccount] = useState('')
  const [cashbookDateFrom, setCashbookDateFrom] = useState('')
  const [cashbookDateTo, setCashbookDateTo] = useState('')
  const [cashbookData, setCashbookData] = useState(null)
  const [cashbookLoading, setCashbookLoading] = useState(false)
  const [imports, setImports] = useState([])
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const fetchCashbook = useCallback(async () => {
    if (!cashbookAccount) { setCashbookData(null); return }
    setCashbookLoading(true)
    try {
      const params = {}
      if (cashbookDateFrom) params.date_from = cashbookDateFrom
      if (cashbookDateTo) params.date_to = cashbookDateTo
      const { data } = await accountingAPI.accounts.cashbook(cashbookAccount, params)
      setCashbookData(data)
    } catch {
      setCashbookData(null)
    } finally {
      setCashbookLoading(false)
    }
  }, [cashbookAccount, cashbookDateFrom, cashbookDateTo])

  const fetchImports = useCallback(async () => {
    if (!cashbookAccount) { setImports([]); return }
    try {
      const { data } = await accountingAPI.statementImports.list({ account: cashbookAccount })
      setImports(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }, [cashbookAccount])

  useEffect(() => {
    if (tab === 'Cashbook') { fetchCashbook(); fetchImports() }
  }, [tab, fetchCashbook, fetchImports])

  const handleUploadStatement = async (e) => {
    e.preventDefault()
    if (!cashbookAccount || !uploadFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('account', cashbookAccount)
      formData.append('file', uploadFile)
      await accountingAPI.statementImports.upload(formData)
      setUploadFile(null)
      fetchImports()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Failed to import statement.')
    } finally {
      setUploading(false)
    }
  }

  const handleAutoMatch = async (importId) => {
    try {
      const { data } = await accountingAPI.statementImports.autoMatch(importId, 5)
      alert(`Matched ${data.matched} of ${data.total_lines} lines.`)
      fetchImports()
      fetchCashbook()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Auto-match failed.')
    }
  }

  const handleFinalizeReconciliation = async (importId) => {
    const statementBalance = window.prompt('Enter the bank statement\'s closing balance for this period:')
    if (statementBalance === null || statementBalance === '') return
    try {
      const { data } = await accountingAPI.statementImports.finalizeReconciliation(importId, statementBalance)
      alert(data.is_reconciled
        ? `Reconciled — book and statement balances match.`
        : `Recorded, but not fully reconciled yet (difference: $${Number(data.difference).toLocaleString()}, or unmatched lines remain). See it under the Reconciliation tab.`)
      fetchImports()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Failed to finalize reconciliation.')
    }
  }

  // ── Trial Balance / Balance Sheet ────────────────────────────────────────
  const [tbDate, setTbDate] = useState(new Date().toISOString().split('T')[0])
  const [tbData, setTbData] = useState(null)
  const [bsDate, setBsDate] = useState(new Date().toISOString().split('T')[0])
  const [bsData, setBsData] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  const fetchTrialBalance = useCallback(async () => {
    setReportLoading(true)
    try {
      const { data } = await reportsAPI.trialBalance({ as_of: tbDate })
      setTbData(data)
    } catch {
      setTbData(null)
    } finally {
      setReportLoading(false)
    }
  }, [tbDate])

  const fetchBalanceSheet = useCallback(async () => {
    setReportLoading(true)
    try {
      const { data } = await reportsAPI.balanceSheet({ as_of: bsDate })
      setBsData(data)
    } catch {
      setBsData(null)
    } finally {
      setReportLoading(false)
    }
  }, [bsDate])

  useEffect(() => { if (tab === 'Trial Balance') fetchTrialBalance() }, [tab, fetchTrialBalance])
  useEffect(() => { if (tab === 'Balance Sheet') fetchBalanceSheet() }, [tab, fetchBalanceSheet])

  useEffect(() => { fetchAccounts() }, [])
  useEffect(() => {
    if (tab === 'Journal Entries') fetchJournalEntries()
    if (tab === 'Trust Accounting') fetchTrustTransactions()
    if (tab === 'Reconciliation') fetchReconciliations()
    if (tab === 'Receipts') fetchReceipts()
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
      setAccountForm({ name: '', account_number: '', account_type: 'asset', subtype: 'other', description: '' })
      fetchAccounts()
    } catch (err) {
      const data = err?.response?.data
      // DRF validation errors come back as {field: [messages]}, not {detail: ...} —
      // surface the real reason instead of a generic message that hides it.
      const fieldError = data && typeof data === 'object'
        ? Object.entries(data).map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(' ') : msgs}`).join('\n')
        : null
      alert(fieldError || data?.detail || 'Failed to create account.')
    } finally {
      setSavingAccount(false)
    }
  }

  const fmtCurrency = (v) => v != null ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
  const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—'

  const accountColumns = [
    { key: 'account_number', label: 'Code' },
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
    { key: 'import_batch', label: 'Source', render: (v) => v ? <Badge value="bank import" /> : <Badge value="manual entry" /> },
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
        {tab === 'Receipts' && (
          <button onClick={() => setReceiptModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Record Receipt
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

      {tab === 'Cashbook' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Account</label>
              <select value={cashbookAccount} onChange={(e) => setCashbookAccount(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white min-w-[220px]">
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.account_number ?? a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input type="date" value={cashbookDateFrom} onChange={(e) => setCashbookDateFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input type="date" value={cashbookDateTo} onChange={(e) => setCashbookDateTo(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <button onClick={fetchCashbook}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              Refresh
            </button>
          </div>

          {cashbookData && (
            <div className="flex gap-6 text-sm">
              <div><span className="text-gray-500">Opening: </span><span className="font-semibold">{fmtCurrency(cashbookData.opening_balance)}</span></div>
              <div><span className="text-gray-500">Closing: </span><span className="font-semibold">{fmtCurrency(cashbookData.closing_balance)}</span></div>
            </div>
          )}

          <Table
            columns={[
              { key: 'date', label: 'Date', render: (v) => new Date(v).toLocaleDateString() },
              { key: 'entry_number', label: 'Entry #' },
              { key: 'description', label: 'Description' },
              { key: 'debit', label: 'Debit', render: (v) => v ? fmtCurrency(v) : '—' },
              { key: 'credit', label: 'Credit', render: (v) => v ? fmtCurrency(v) : '—' },
              { key: 'running_balance', label: 'Running Balance', render: (v) => fmtCurrency(v) },
              { key: 'is_reconciled', label: 'Reconciled', render: (v) => <Badge value={v ? 'reconciled' : 'pending'} /> },
            ]}
            data={cashbookData?.entries ?? []}
            loading={cashbookLoading}
            emptyMessage={cashbookAccount ? 'No cash movements in this period.' : 'Select an account to view its cashbook.'}
          />

          {/* Bank statement import + reconciliation */}
          {cashbookAccount && (
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Bank Statement Import & Reconciliation</h3>
              <form onSubmit={handleUploadStatement} className="flex items-center gap-3">
                <input type="file" accept=".csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="text-sm" />
                <button type="submit" disabled={!uploadFile || uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-900 disabled:opacity-50">
                  <Upload size={13} /> {uploading ? 'Importing…' : 'Import CSV'}
                </button>
                <span className="text-xs text-gray-400">Columns: date, description, reference, amount (or debit/credit)</span>
              </form>

              <Table
                columns={[
                  { key: 'imported_at', label: 'Imported', render: (v) => new Date(v).toLocaleString() },
                  { key: 'file_name', label: 'File' },
                  { key: 'line_count', label: 'Lines' },
                  { key: 'matched_count', label: 'Matched', render: (v, row) => `${v} / ${row.line_count}` },
                  {
                    key: 'id', label: 'Action',
                    render: (v) => (
                      <div className="flex gap-1.5">
                        <button onClick={() => handleAutoMatch(v)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">
                          <RefreshCw size={12} /> Auto-Match
                        </button>
                        <button onClick={() => handleFinalizeReconciliation(v)}
                          className="text-xs px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700">
                          Finalize Reconciliation
                        </button>
                      </div>
                    ),
                  },
                ]}
                data={imports}
                loading={false}
                emptyMessage="No bank statements imported yet for this account."
              />
            </div>
          )}
        </div>
      )}

      {tab === 'Trial Balance' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6 space-y-4">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">As of</label>
              <input type="date" value={tbDate} onChange={(e) => setTbDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <button onClick={fetchTrialBalance}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              Generate
            </button>
            {tbData && (
              <Badge value={tbData.is_balanced ? 'balanced' : 'out of balance'} />
            )}
          </div>
          <Table
            columns={[
              { key: 'account_number', label: 'Code' },
              { key: 'account_name', label: 'Account' },
              { key: 'account_type', label: 'Type', render: (v) => <Badge value={v} /> },
              { key: 'debit', label: 'Debit', render: (v) => v ? fmtCurrency(v) : '—' },
              { key: 'credit', label: 'Credit', render: (v) => v ? fmtCurrency(v) : '—' },
            ]}
            data={tbData?.accounts ?? []}
            loading={reportLoading}
            emptyMessage="No posted activity as of this date."
          />
          {tbData && (
            <div className="flex justify-end gap-8 pt-2 border-t border-gray-100 text-sm font-semibold">
              <div>Total Debit: {fmtCurrency(tbData.total_debit)}</div>
              <div>Total Credit: {fmtCurrency(tbData.total_credit)}</div>
            </div>
          )}
        </div>
      )}

      {tab === 'Balance Sheet' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6 space-y-5">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">As of</label>
              <input type="date" value={bsDate} onChange={(e) => setBsDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <button onClick={fetchBalanceSheet}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              Generate
            </button>
            {bsData && <Badge value={bsData.is_balanced ? 'balanced' : 'out of balance'} />}
          </div>

          {reportLoading && <p className="text-sm text-gray-400">Loading…</p>}

          {bsData && !reportLoading && (
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Assets</h3>
                {bsData.assets.items.map((it) => (
                  <div key={it.account_id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">{it.account_name}</span>
                    <span className="font-medium">{fmtCurrency(it.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-2 mt-1 border-t border-gray-200">
                  <span>Total Assets</span><span>{fmtCurrency(bsData.assets.total)}</span>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Liabilities</h3>
                {bsData.liabilities.items.map((it) => (
                  <div key={it.account_id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">{it.account_name}</span>
                    <span className="font-medium">{fmtCurrency(it.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-2 mt-1 border-t border-gray-200">
                  <span>Total Liabilities</span><span>{fmtCurrency(bsData.liabilities.total)}</span>
                </div>

                <h3 className="text-sm font-bold text-gray-700 mb-2 mt-5">Equity</h3>
                {bsData.equity.items.map((it, i) => (
                  <div key={it.account_id ?? `eq-${i}`} className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">{it.account_name}</span>
                    <span className="font-medium">{fmtCurrency(it.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-2 mt-1 border-t border-gray-200">
                  <span>Total Equity</span><span>{fmtCurrency(bsData.equity.total)}</span>
                </div>

                <div className="flex justify-between text-sm font-bold pt-2 mt-3 border-t-2 border-gray-300">
                  <span>Total Liabilities + Equity</span><span>{fmtCurrency(bsData.total_liabilities_and_equity)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {['Chart of Accounts', 'Journal Entries', 'Trust Accounting', 'Reconciliation', 'Receipts', 'Audit Trail'].includes(tab) && (
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
          {tab === 'Receipts' && (
            <Table columns={receiptColumns} data={receipts} loading={false} emptyMessage="No receipts issued yet." />
          )}
          {tab === 'Audit Trail' && (
            <Table columns={auditColumns} data={auditLogs} loading={false} emptyMessage="No audit log entries." />
          )}
        </div>
      )}

      {/* Record (manual) Receipt Modal */}
      <Modal open={receiptModal} onClose={() => setReceiptModal(false)} title="Record Receipt (Other Incoming Funds)">
        <form onSubmit={handleAddReceipt} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Payer Name *</label>
              <input required value={receiptForm.payer_name}
                onChange={(e) => setReceiptForm({ ...receiptForm, payer_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input required type="number" step="0.01" value={receiptForm.amount}
                onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={receiptForm.currency} onChange={(e) => setReceiptForm({ ...receiptForm, currency: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <input value={receiptForm.payment_method}
                onChange={(e) => setReceiptForm({ ...receiptForm, payment_method: e.target.value })}
                placeholder="e.g. cash, ecocash"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Received Date *</label>
              <input required type="date" value={receiptForm.received_date}
                onChange={(e) => setReceiptForm({ ...receiptForm, received_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
              <input value={receiptForm.reference}
                onChange={(e) => setReceiptForm({ ...receiptForm, reference: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea rows={2} value={receiptForm.description}
                onChange={(e) => setReceiptForm({ ...receiptForm, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setReceiptModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingReceipt}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {savingReceipt ? 'Saving...' : 'Record Receipt'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Printable Receipt View */}
      <Modal open={!!viewReceipt} onClose={() => setViewReceipt(null)} title="Receipt">
        {viewReceipt && (
          <div>
            <div id="receipt-print-area" className="border border-gray-200 rounded-lg p-6 space-y-4">
              <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                <div>
                  <p className="font-bold text-lg text-gray-800">PropManager ZW</p>
                  <p className="text-xs text-gray-500">Official Receipt</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold">{viewReceipt.receipt_number}</p>
                  <p className="text-xs text-gray-500">{viewReceipt.received_date ? new Date(viewReceipt.received_date).toLocaleDateString() : ''}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Received From:</span> <span className="font-medium">{viewReceipt.payer_name}</span></div>
                <div><span className="text-gray-500">Source:</span> <span className="font-medium capitalize">{viewReceipt.source_type?.replace(/_/g, ' ')}</span></div>
                <div><span className="text-gray-500">Payment Method:</span> <span className="font-medium capitalize">{viewReceipt.payment_method?.replace(/_/g, ' ') || '—'}</span></div>
                <div><span className="text-gray-500">Reference:</span> <span className="font-medium">{viewReceipt.reference || '—'}</span></div>
                {viewReceipt.property_name && (
                  <div className="col-span-2"><span className="text-gray-500">Property:</span> <span className="font-medium">{viewReceipt.property_name}</span></div>
                )}
                <div className="col-span-2"><span className="text-gray-500">Description:</span> <span className="font-medium">{viewReceipt.description || '—'}</span></div>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Amount Received</span>
                <span className="text-xl font-bold text-green-700">
                  {viewReceipt.currency ?? 'USD'} {Number(viewReceipt.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">Issued by {viewReceipt.issued_by_name ?? 'System'}</p>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setViewReceipt(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Close</button>
              <button onClick={() => window.print()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Print</button>
            </div>
          </div>
        )}
      </Modal>

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
              <input required value={accountForm.account_number} onChange={(e) => setAccountForm({ ...accountForm, account_number: e.target.value })}
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
              <select value={accountForm.subtype} onChange={(e) => setAccountForm({ ...accountForm, subtype: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {[
                  ['trust', 'Trust Account'], ['operating', 'Operating'], ['savings', 'Savings'],
                  ['checking', 'Checking'], ['accounts_receivable', 'Accounts Receivable'],
                  ['accounts_payable', 'Accounts Payable'], ['other', 'Other'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
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
