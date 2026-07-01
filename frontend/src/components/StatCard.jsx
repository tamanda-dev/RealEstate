export default function StatCard({ icon: Icon, label, value, trend, trendLabel, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  }

  const trendColor =
    trend === undefined
      ? ''
      : trend >= 0
      ? 'text-green-600'
      : 'text-red-600'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-start gap-4">
      {Icon && (
        <div className={`p-3 rounded-lg ${colorMap[color] ?? colorMap.blue}`}>
          <Icon size={22} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-800 mt-0.5">{value ?? '—'}</p>
        {trend !== undefined && (
          <p className={`text-xs mt-1 ${trendColor}`}>
            {trend >= 0 ? '+' : ''}{trend}% {trendLabel ?? 'vs last month'}
          </p>
        )}
      </div>
    </div>
  )
}
