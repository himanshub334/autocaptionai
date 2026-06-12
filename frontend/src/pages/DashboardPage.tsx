import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Video, Clock, CheckCircle, AlertCircle, Upload, ChevronRight, Loader2 } from 'lucide-react'
import api from '../lib/api'
import { VideoStatusBadge } from '../components/VideoStatusBadge'
import { useAuthStore } from '../store/authStore'

export function DashboardPage() {
  const { user } = useAuthStore()

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: () => api.get('/api/analytics/dashboard').then(r => r.data),
    refetchInterval: 30_000,
  })

  const stats = analytics?.stats
  const recent = analytics?.recent_activity || []

  const statCards = [
    { label: 'Total Videos', value: stats?.total_videos ?? '—', icon: Video, color: 'text-brand-400' },
    { label: 'Completed', value: stats?.completed ?? '—', icon: CheckCircle, color: 'text-emerald-400' },
    { label: 'Processing', value: stats?.processing ?? '—', icon: Loader2, color: 'text-amber-400' },
    { label: 'Minutes Transcribed', value: stats?.total_minutes ?? '—', icon: Clock, color: 'text-mint-400' },
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-text-secondary mt-1">Here's what's happening with your captions</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-3xl font-bold text-text-primary">{s.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent videos */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-text-primary">Recent Videos</h2>
            <Link to="/upload" className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              Upload
            </Link>
          </div>

          <div className="card divide-y divide-surface-border">
            {isLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
              </div>
            ) : recent.length === 0 ? (
              <div className="p-8 text-center">
                <Video className="w-10 h-10 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary font-medium">No videos yet</p>
                <p className="text-text-muted text-sm mt-1">Upload a video to get started</p>
                <Link to="/upload" className="btn-primary inline-flex mt-4 text-sm items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload your first video
                </Link>
              </div>
            ) : (
              recent.map((video: any) => (
                <Link
                  key={video.id}
                  to={`/videos/${video.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-surface-hover transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5 text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{video.original_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <VideoStatusBadge status={video.status} />
                      {video.duration && (
                        <span className="text-xs text-text-muted">
                          {Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}
                        </span>
                      )}
                      {video.detected_language && (
                        <span className="text-xs text-text-muted uppercase">{video.detected_language}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-brand-400 transition-colors" />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Languages breakdown */}
        <div>
          <h2 className="font-semibold text-text-primary mb-4">Languages</h2>
          <div className="card p-5">
            {analytics?.languages?.length ? (
              <div className="space-y-3">
                {analytics.languages.map((lang: any) => (
                  <div key={lang.language} className="flex items-center gap-3">
                    <span className="text-sm text-text-secondary uppercase w-8">{lang.language}</span>
                    <div className="flex-1 bg-surface-hover rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-mint-400 rounded-full"
                        style={{
                          width: `${Math.min(100, (lang.count / Math.max(...analytics.languages.map((l: any) => l.count))) * 100)}%`
                        }}
                      />
                    </div>
                    <span className="text-xs text-text-muted w-6 text-right">{lang.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-muted text-sm text-center py-4">No data yet</p>
            )}
          </div>

          {/* Quick actions */}
          <h2 className="font-semibold text-text-primary mb-4 mt-6">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { to: '/upload', label: 'Upload Video', icon: Upload },
              { to: '/projects', label: 'View Projects', icon: Video },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 p-3 card hover:bg-surface-hover transition-colors rounded-xl"
              >
                <Icon className="w-4 h-4 text-brand-400" />
                <span className="text-sm text-text-primary">{label}</span>
                <ChevronRight className="w-4 h-4 text-text-muted ml-auto" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
