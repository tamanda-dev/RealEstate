const colorMap = {
  // status
  active:      'bg-green-100 text-green-700',
  paid:        'bg-green-100 text-green-700',
  completed:   'bg-green-100 text-green-700',
  reconciled:  'bg-green-100 text-green-700',
  accepted:    'bg-green-100 text-green-700',
  posted:      'bg-green-100 text-green-700',

  pending:     'bg-yellow-100 text-yellow-700',
  partial:     'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  open:        'bg-yellow-100 text-yellow-700',
  counter:     'bg-yellow-100 text-yellow-700',
  draft:       'bg-gray-100 text-gray-600',
  void:        'bg-gray-100 text-gray-600',
  cancelled:   'bg-gray-100 text-gray-600',
  inactive:    'bg-gray-100 text-gray-600',
  expired:     'bg-gray-100 text-gray-600',

  overdue:     'bg-red-100 text-red-700',
  emergency:   'bg-red-100 text-red-700',
  rejected:    'bg-red-100 text-red-700',

  high:        'bg-orange-100 text-orange-700',
  medium:      'bg-yellow-100 text-yellow-700',
  low:         'bg-gray-100 text-gray-600',

  // property types
  residential: 'bg-blue-100 text-blue-700',
  commercial:  'bg-purple-100 text-purple-700',
  industrial:  'bg-indigo-100 text-indigo-700',
  land:        'bg-lime-100 text-lime-700',

  // valuation methods
  avm:         'bg-cyan-100 text-cyan-700',
  cma:         'bg-teal-100 text-teal-700',
  manual:      'bg-slate-100 text-slate-600',

  // contact types
  buyer:       'bg-sky-100 text-sky-700',
  seller:      'bg-violet-100 text-violet-700',
  investor:    'bg-fuchsia-100 text-fuchsia-700',
  tenant:      'bg-emerald-100 text-emerald-700',
}

export default function Badge({ value, label }) {
  const key = (value ?? '').toString().toLowerCase().replace(/\s+/g, '_')
  const cls = colorMap[key] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {label ?? (value ?? '').toString().replace(/_/g, ' ')}
    </span>
  )
}
