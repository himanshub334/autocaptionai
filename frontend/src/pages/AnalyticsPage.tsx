import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Loader2 } from 'lucide-react'
import api from '../lib/api'
import { format } from 'date-fns'

const COLORS = ['#6b5aff', '#2dd4aa', '#f59e0b', '#ef4444', '#3b82f6']

export function AnalyticsPage() {
  const { data: dashboard, isLoading: l1 } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: () => api.get('/api/analytics/dashboard').then(r => r.data),
  })

  const { data: usage, isLoading: l2 } = useQuery({
    queryKey: ['analytics-usage'],
    queryFn: () => api.get('/api/analytics/usage').then(r => r.data.usage),
  })

  if (l1 || l2) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    )
  }

  const chartData = (usage || []).map((u: any) => ({
    date: format(new Date(u.date), 'MMM d'),
    videos: parseInt(u.videos),
    minutes: Math.round((parseFloat(u.duration_seconds) || 0) / 60),
  }))

  const langData = (dashboard?.languages || []).map((l: any) => ({
    name: l.language?.toUpperCase() || 'Unknown',
    value: parseInt(l.count),
  }))

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
        <p className="text-text-secondary mt-1">Track your transcription usage over time</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Videos', value: dashboard?.stats?.total_videos },
          { label: 'Completed', value: dashboard?.stats?.completed },
          { label: 'Failed', value: dashboard?.stats?.failed },
          { label: 'Total Minutes', value: dashboard?.stats?.total_minutes },
        ].map(s => (
          <div key={s.label} className="card p-5">
            <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">{s.label}</p>
            <p className="text-3xl font-bold text-text-primary">{s.value ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Usage over time */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="font-semibold text-text-primary mb-4">Activity (Last 30 Days)</h2>
          {chartData.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-16">No activity yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVideos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6b5aff" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6b5aff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2650" />
                <XAxis dataKey="date" stroke="#5e5c85" fontSize={12} />
                <YAxis stroke="#5e5c85" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#16142a', border: '1px solid #2a2650', borderRadius: '8px' }}
                  labelStyle={{ color: '#e8e6ff' }}
                />
                <Area type="monotone" dataKey="videos" stroke="#6b5aff" fill="url(#colorVideos)" name="Videos" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Language breakdown */}
        <div className="card p-5">
          <h2 className="font-semibold text-text-primary mb-4">Languages Detected</h2>
          {langData.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-16">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={langData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label
                >
                  {langData.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#16142a', border: '1px solid #2a2650', borderRadius: '8px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
