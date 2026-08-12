import { useState, useEffect, useCallback } from 'react'
import { expensesAPI, propertiesAPI } from '../services/api'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import {
  DollarSign, Plus, Search, CheckCircle,
  Clock, AlertTriangle, RefreshCw, TrendingDown, BarChart2,
  Tag
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts'

const CATEGORY_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1',
]

const TABS = ['All Expenses', 'By Category', 'Monthly Trend', 'Budget vs Actual', 'Categories']

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState('All Expenses')
  const [expenses, setExpenses] = useState([])
  const [stats, setStats] = useState({})
  const [categories, setCategories] = useState([])
  const [properties, setProperties] = useState([])
  const [byCategoryData, setByCategoryData] = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [budgetData, setBudgetData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // filters
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterProperty, setFilterProperty] = useState('')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())

  // modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showBudgetModal, setShowBudgetModal] = useState(false)

  const currentYear = new Date().getFullYear()

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterCategory) params.category = filterCategory
      if (filterProperty) params.property = filterProperty

      // allSettled so one failing request (e.g. stats) can't blank out data from the
      // others that succeeded — previously a single failure wiped every dropdown via
      // the shared catch block, even though its own request had come back fine.
      const [expRes, statsRes, catRes, propRes] = await Promise.allSettled([
        expensesAPI.list(params),
        expensesAPI.stats(),
        expensesAPI.categories.list(),
        propertiesAPI.list(),
      ])
      const failures = []
      if (expRes.status === 'fulfilled') setExpenses(expRes.value.data.results || expRes.value.data)
      else failures.push('expenses')
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
      else failures.push('stats')
      if (catRes.status === 'fulfilled') setCategories(catRes.value.data.results || catRes.value.data)
      else failures.push('categories')
      if (propRes.status === 'fulfilled') setProperties(propRes.value.data.results || propRes.value.data)
      else failures.push('properties')
      if (failures.length) setError(`Failed to load: ${failures.join(', ')}`)
    } catch {
      setError('Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterCategory, filterProperty])

  const loadChartData = useCallback(async () => {
    try {
      const params = { year: filterYear }
      if (filterProperty) params.property = filterProperty
      const [catRes, trendRes, budgetRes] = await Promise.all([
        expensesAPI.byCategory(params),
        expensesAPI.monthlyTrend(params),
        expensesAPI.budgets.vsActual(params),
      ])
      setByCategoryData(catRes.data)
      setMonthlyData(trendRes.data)
      setBudgetData(budgetRes.data)
    } catch { }
  }, [filterYear, filterProperty])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => {
    if (['By Category', 'Monthly Trend', 'Budget vs Actual'].includes(activeTab)) {
      loadChartData()
    }
  }, [activeTab, loadChartData])

  const filtered = expenses.filter(e =>
    !search ||
    e.description?.toLowerCase().includes(search.toLowerCase()) ||
    e.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.category_name?.toLowerCase().includes(search.toLowerCase())
  )

  const fmt = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Operating Expenses</h1>
          <p className="text-slate-500 text-sm mt-1">Track and manage all property operating costs</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={DollarSign} label="This Month" value={fmt(stats.total_this_month || 0)} color="blue" />
        <StatCard icon={TrendingDown} label="This Year" value={fmt(stats.total_this_year || 0)} color="purple" />
        <StatCard icon={Clock} label="Pending" value={stats.pending_count || 0} color="yellow" />
        <StatCard icon={DollarSign} label="Pending Amount" value={fmt(stats.pending_amount || 0)} color="orange" />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdue_count || 0} color="red" />
        <StatCard icon={RefreshCw} label="Recurring" value={stats.recurring_count || 0} color="green" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'All Expenses' && (
            <AllExpensesTab
              expenses={filtered}
              loading={loading}
              search={search}
              setSearch={setSearch}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterCategory={filterCategory}
              setFilterCategory={setFilterCategory}
              filterProperty={filterProperty}
              setFilterProperty={setFilterProperty}
              categories={categories}
              properties={properties}
              onMarkPaid={setShowPayModal}
              onRefresh={loadAll}
              fmt={fmt}
            />
          )}
          {activeTab === 'By Category' && (
            <ByCategoryTab
              data={byCategoryData}
              filterProperty={filterProperty}
              setFilterProperty={setFilterProperty}
              filterYear={filterYear}
              setFilterYear={setFilterYear}
              properties={properties}
              currentYear={currentYear}
              onRefresh={loadChartData}
              fmt={fmt}
            />
          )}
          {activeTab === 'Monthly Trend' && (
            <MonthlyTrendTab
              data={monthlyData}
              filterProperty={filterProperty}
              setFilterProperty={setFilterProperty}
              filterYear={filterYear}
              setFilterYear={setFilterYear}
              properties={properties}
              currentYear={currentYear}
              fmt={fmt}
            />
          )}
          {activeTab === 'Budget vs Actual' && (
            <BudgetTab
              data={budgetData}
              filterProperty={filterProperty}
              setFilterProperty={setFilterProperty}
              filterYear={filterYear}
              setFilterYear={setFilterYear}
              properties={properties}
              currentYear={currentYear}
              onAddBudget={() => setShowBudgetModal(true)}
              fmt={fmt}
            />
          )}
          {activeTab === 'Categories' && (
            <CategoriesTab
              categories={categories}
              onAdd={() => setShowCategoryModal(true)}
              onRefresh={loadAll}
            />
          )}
        </div>
      </div>

      {/* Add Expense Modal */}
      {showAddModal && (
        <AddExpenseModal
          categories={categories}
          properties={properties}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); loadAll() }}
        />
      )}

      {/* Mark Paid Modal */}
      {showPayModal && (
        <MarkPaidModal
          expense={showPayModal}
          onClose={() => setShowPayModal(null)}
          onSaved={() => { setShowPayModal(null); loadAll() }}
        />
      )}

      {/* Add Category Modal */}
      {showCategoryModal && (
        <AddCategoryModal
          onClose={() => setShowCategoryModal(false)}
          onSaved={() => { setShowCategoryModal(false); loadAll() }}
        />
      )}

      {/* Add Budget Modal */}
      {showBudgetModal && (
        <AddBudgetModal
          categories={categories}
          properties={properties}
          onClose={() => setShowBudgetModal(false)}
          onSaved={() => { setShowBudgetModal(false); loadChartData() }}
        />
      )}
    </div>
  )
}

/* ─── All Expenses Tab ─── */
function AllExpensesTab({ expenses, loading, search, setSearch, filterStatus, setFilterStatus,
  filterCategory, setFilterCategory, filterProperty, setFilterProperty,
  categories, properties, onMarkPaid, fmt }) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search description, vendor…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <TrendingDown size={40} className="mx-auto mb-2 opacity-40" />
          <p>No expenses found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 pr-4 font-medium">Description</th>
                <th className="pb-3 pr-4 font-medium">Category</th>
                <th className="pb-3 pr-4 font-medium">Property</th>
                <th className="pb-3 pr-4 font-medium">Vendor</th>
                <th className="pb-3 pr-4 font-medium text-right">Amount</th>
                <th className="pb-3 pr-4 font-medium">Recurrence</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {expenses.map(e => (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{e.expense_date}</td>
                  <td className="py-3 pr-4 font-medium text-slate-800 max-w-xs truncate">{e.description}</td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">
                      <Tag size={10} /> {e.category_name}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{e.property_name}</td>
                  <td className="py-3 pr-4 text-slate-500">{e.vendor_name || '—'}</td>
                  <td className="py-3 pr-4 text-right font-semibold text-slate-800">{fmt(e.amount)}</td>
                  <td className="py-3 pr-4">
                    {e.is_recurring ? (
                      <span className="flex items-center gap-1 text-xs text-blue-600">
                        <RefreshCw size={11} /> {e.recurrence_display}
                      </span>
                    ) : <span className="text-xs text-slate-400">One-time</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={e.status}>{e.status_display}</Badge>
                  </td>
                  <td className="py-3">
                    {e.status === 'pending' && (
                      <button
                        onClick={() => onMarkPaid(e)}
                        className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                      >
                        <CheckCircle size={13} /> Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ─── By Category Tab ─── */
function ByCategoryTab({ data, filterProperty, setFilterProperty, filterYear, setFilterYear,
  properties, currentYear, fmt }) {
  const total = data.reduce((s, d) => s + Number(d.total), 0)
  const pieData = data.map((d, i) => ({
    name: d.category__name,
    value: Number(d.total),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }))

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          {[currentYear, currentYear - 1, currentYear - 2].map(y =>
            <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Expense Distribution</h3>
          {data.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`$${v.toLocaleString()}`, 'Amount']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category table */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Breakdown</h3>
          <div className="space-y-2">
            {data.map((d, i) => {
              const pct = total > 0 ? (Number(d.total) / total * 100).toFixed(1) : 0
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-700 truncate">{d.category__name}</span>
                      <span className="font-semibold text-slate-800 ml-2">{fmt(d.total)}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-slate-100 rounded-full">
                      <div className="h-1.5 rounded-full" style={{
                        width: `${pct}%`,
                        backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length]
                      }} />
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                </div>
              )
            })}
            {data.length > 0 && (
              <div className="pt-2 border-t border-slate-200 flex justify-between font-semibold text-slate-800">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Monthly Trend Tab ─── */
function MonthlyTrendTab({ data, filterProperty, setFilterProperty, filterYear, setFilterYear,
  properties, currentYear, fmt }) {
  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          {[currentYear, currentYear - 1, currentYear - 2].map(y =>
            <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => [`$${v.toLocaleString()}`, 'Total Expenses']} />
          <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="pb-2 font-medium">Month</th>
              <th className="pb-2 font-medium text-right">Total Spent</th>
              <th className="pb-2 font-medium text-right"># Expenses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.filter(d => d.total > 0).map((d, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="py-2 font-medium text-slate-700">{d.month}</td>
                <td className="py-2 text-right font-semibold">{fmt(d.total)}</td>
                <td className="py-2 text-right text-slate-500">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── Budget vs Actual Tab ─── */
function BudgetTab({ data, filterProperty, setFilterProperty, filterYear, setFilterYear,
  properties, currentYear, onAddBudget, fmt }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3">
          <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {[currentYear, currentYear - 1, currentYear - 2].map(y =>
              <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={onAddBudget}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm">
          <Plus size={14} /> Add Budget
        </button>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          <BarChart2 size={36} className="mx-auto mb-2 opacity-40" />
          <p>No budgets set for this period</p>
          <button onClick={onAddBudget} className="mt-3 text-blue-600 hover:underline text-sm">Set a budget</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="pb-3 pr-4 font-medium">Property</th>
                <th className="pb-3 pr-4 font-medium">Category</th>
                <th className="pb-3 pr-4 font-medium">Period</th>
                <th className="pb-3 pr-4 font-medium text-right">Budgeted</th>
                <th className="pb-3 pr-4 font-medium text-right">Actual</th>
                <th className="pb-3 font-medium text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.map(b => {
                const variance = Number(b.variance)
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-4 text-slate-700">{b.property_name}</td>
                    <td className="py-3 pr-4 text-slate-700">{b.category_name}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {b.month ? `${b.year}/${String(b.month).padStart(2,'0')}` : b.year}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">{fmt(b.budgeted_amount)}</td>
                    <td className="py-3 pr-4 text-right">{fmt(b.actual_amount)}</td>
                    <td className={`py-3 text-right font-semibold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {variance >= 0 ? '+' : ''}{fmt(variance)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ─── Categories Tab ─── */
function CategoriesTab({ categories, onAdd }) {
  const grouped = categories.reduce((acc, c) => {
    const key = c.category_type_display || c.category_type
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{categories.length} categories configured</p>
        <button onClick={onAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm">
          <Plus size={14} /> Add Category
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(grouped).map(([type, cats]) => (
          <div key={type} className="border border-slate-200 rounded-lg p-4">
            <h4 className="font-semibold text-slate-700 mb-2 text-sm">{type}</h4>
            <div className="space-y-1">
              {cats.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className={`${c.is_active ? 'text-slate-600' : 'text-slate-300 line-through'}`}>
                    {c.name}
                  </span>
                  {c.is_tax_deductible && (
                    <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                      Tax deductible
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Add Expense Modal ─── */
function AddExpenseModal({ categories, properties, onClose, onSaved }) {
  const [form, setForm] = useState({
    property: '', category: '', description: '', amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    due_date: '', vendor_name: '', status: 'pending',
    is_recurring: false, recurrence: 'none', notes: '', payment_method: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await expensesAPI.create(form)
      onSaved()
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={true} title="Add Operating Expense" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 rounded p-2 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Property *</label>
            <select required value={form.property} onChange={e => set('property', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Category *</label>
            <select required value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select category…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
          <input required value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="e.g. Annual property insurance renewal"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount *</label>
            <input required type="number" step="0.01" min="0" value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vendor / Payee</label>
            <input value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)}
              placeholder="e.g. State Farm Insurance"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Expense Date *</label>
            <input required type="date" value={form.expense_date}
              onChange={e => set('expense_date', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Recurrence</label>
            <select value={form.recurrence} onChange={e => {
              set('recurrence', e.target.value)
              set('is_recurring', e.target.value !== 'none')
            }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="none">One-Time</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
        </div>

        {form.status === 'paid' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
              <input value={form.payment_method} onChange={e => set('payment_method', e.target.value)}
                placeholder="e.g. Bank Transfer"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Expense'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Mark Paid Modal ─── */
function MarkPaidModal({ expense, onClose, onSaved }) {
  const [form, setForm] = useState({
    paid_date: new Date().toISOString().split('T')[0],
    payment_method: '',
    reference_number: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await expensesAPI.markPaid(expense.id, form)
      onSaved()
    } catch { } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={true} title="Mark Expense as Paid" onClose={onClose} size="sm">
      <div className="mb-4 bg-slate-50 rounded-lg p-3">
        <p className="font-medium text-slate-800">{expense.description}</p>
        <p className="text-slate-500 text-sm">{expense.category_name} · {expense.property_name}</p>
        <p className="text-blue-600 font-semibold text-lg mt-1">
          ${Number(expense.amount).toLocaleString()}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment Date *</label>
          <input required type="date" value={form.paid_date}
            onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
          <select value={form.payment_method}
            onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Select…</option>
            <option>Bank Transfer</option>
            <option>Check</option>
            <option>Credit Card</option>
            <option>ACH</option>
            <option>Cash</option>
            <option>Online Payment</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reference / Check #</label>
          <input value={form.reference_number}
            onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
            placeholder="Optional"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Add Category Modal ─── */
function AddCategoryModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', category_type: 'other', description: '', is_tax_deductible: true })
  const [saving, setSaving] = useState(false)

  const TYPES = [
    'insurance','taxes','utilities','mortgage','management',
    'repairs','landscaping','hoa','advertising','legal','accounting','supplies','travel','other'
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await expensesAPI.categories.create(form)
      onSaved()
    } catch { } finally { setSaving(false) }
  }

  return (
    <Modal open={true} title="Add Expense Category" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
          <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Type *</label>
          <select value={form.category_type} onChange={e => setForm(f => ({ ...f, category_type: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="taxded" checked={form.is_tax_deductible}
            onChange={e => setForm(f => ({ ...f, is_tax_deductible: e.target.checked }))}
            className="rounded" />
          <label htmlFor="taxded" className="text-sm text-slate-700">Tax deductible</label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Category'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Add Budget Modal ─── */
function AddBudgetModal({ categories, properties, onClose, onSaved }) {
  const [form, setForm] = useState({
    property: '', category: '', year: new Date().getFullYear(), month: '', budgeted_amount: ''
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await expensesAPI.budgets.create({ ...form, month: form.month || null })
      onSaved()
    } catch { } finally { setSaving(false) }
  }

  return (
    <Modal open={true} title="Set Expense Budget" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Property *</label>
          <select required value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Select property…</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Category *</label>
          <select required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Select category…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Year *</label>
            <input required type="number" value={form.year}
              onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Month (blank = annual)</label>
            <select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Annual</option>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) =>
                <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Budgeted Amount *</label>
          <input required type="number" step="0.01" min="0" value={form.budgeted_amount}
            onChange={e => setForm(f => ({ ...f, budgeted_amount: e.target.value }))}
            placeholder="0.00"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Budget'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
