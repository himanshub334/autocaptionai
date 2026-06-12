import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import ReactPlayer from 'react-player'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Download, Pencil, RefreshCw, Trash2, Loader2,
  FileText, FileJson, FileVideo, Captions, Languages, Clock
} from 'lucide-react'
import api from '../lib/api'
import { VideoStatusBadge } from '../components/VideoStatusBadge'

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued for processing',
  downloading: 'Downloading video',
  extracting_audio: 'Extracting audio track',
  transcribing: 'Transcribing speech (Whisper AI)',
  processing: 'Processing segments',
  diarizing: 'Identifying speakers',
  generating_subtitles: 'Generating subtitle files',
  completed: 'Completed',
}

export function VideoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['video', id],
    queryFn: () => api.get(`/api/videos/${id}`).then(r => r.data.video),
  })

  const { data: statusData } = useQuery({
    queryKey: ['video-status', id],
    queryFn: () => api.get(`/api/videos/${id}/status`).then(r => r.data),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'processing' || s === 'queued' ? 2000 : false
    },
  })

  useEffect(() => {
    if (statusData?.status === 'completed' && data?.status !== 'completed') {
      queryClient.invalidateQueries({ queryKey: ['video', id] })
    }
  }, [statusData?.status])

  async function handleDownload(format: string) {
    try {
      const res = await api.get(`/api/subtitles/${id}/download/${format}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `${data?.original_name?.replace(/\.[^.]+$/, '')}.${format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Download failed')
    }
  }

  async function handleDownloadArchive() {
    try {
      const res = await api.post(`/api/exports/archive/${id}`, {}, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `${data?.original_name?.replace(/\.[^.]+$/, '')}_subtitles.zip`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Archive download failed')
    }
  }

  async function handleReprocess() {
    try {
      await api.post(`/api/videos/${id}/reprocess`, {})
      toast.success('Reprocessing started')
      queryClient.invalidateQueries({ queryKey: ['video-status', id] })
    } catch {
      toast.error('Failed to start reprocessing')
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this video and all subtitles? This cannot be undone.')) return
    try {
      await api.delete(`/api/videos/${id}`)
      toast.success('Video deleted')
      navigate('/')
    } catch {
      toast.error('Delete failed')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    )
  }

  if (!data) return <div className="p-8 text-text-secondary">Video not found</div>

  const status = statusData?.status || data.status
  const progress = statusData?.progress ?? data.progress ?? 0
  const isProcessing = status === 'processing' || status === 'queued'

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-primary truncate">{data.original_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <VideoStatusBadge status={status} />
            {data.detected_language && (
              <span className="badge-default">
                <Languages className="w-3 h-3" />
                {data.detected_language.toUpperCase()}
              </span>
            )}
            {data.duration && (
              <span className="badge-default">
                <Clock className="w-3 h-3" />
                {Math.floor(data.duration / 60)}:{String(Math.floor(data.duration % 60)).padStart(2, '0')}
              </span>
            )}
          </div>
        </div>
        <button onClick={handleDelete} className="btn-ghost p-2 hover:text-red-400 hover:bg-red-500/10">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video preview */}
        <div className="lg:col-span-2">
          <div className="card overflow-hidden aspect-video bg-black flex items-center justify-center">
            {data.playback_url ? (
              <ReactPlayer
                url={data.playback_url}
                controls
                width="100%"
                height="100%"
              />
            ) : (
              <FileVideo className="w-12 h-12 text-text-muted" />
            )}
          </div>

          {/* Processing status */}
          {isProcessing && (
            <div className="card p-5 mt-4">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                <span className="text-sm font-medium text-text-primary">
                  {STAGE_LABELS[statusData?.status as string] || 'Processing...'}
                </span>
                <span className="text-sm text-text-muted ml-auto">{progress}%</span>
              </div>
              <div className="w-full bg-surface-hover rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-500 to-mint-400 rounded-full transition-all duration-500 shimmer"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-text-muted mt-3">
                AI transcription runs locally using Faster-Whisper — larger models and longer videos take more time.
              </p>
            </div>
          )}

          {status === 'failed' && (
            <div className="card p-5 mt-4 border-red-500/30 bg-red-500/5">
              <p className="text-sm font-medium text-red-400 mb-1">Processing failed</p>
              <p className="text-xs text-text-muted">{data.error_message || 'An unknown error occurred'}</p>
              <button onClick={handleReprocess} className="btn-secondary mt-3 text-xs flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" />
                Retry transcription
              </button>
            </div>
          )}
        </div>

        {/* Actions sidebar */}
        <div className="space-y-4">
          {status === 'completed' && (
            <>
              <Link
                to={`/videos/${id}/editor`}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
              >
                <Pencil className="w-4 h-4" />
                Open Subtitle Editor
              </Link>

              <div className="card p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <Captions className="w-4 h-4 text-brand-400" />
                  Download Subtitles
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { fmt: 'srt', label: '.SRT', icon: FileText },
                    { fmt: 'vtt', label: '.VTT', icon: FileText },
                    { fmt: 'txt', label: '.TXT', icon: FileText },
                    { fmt: 'json', label: '.JSON', icon: FileJson },
                  ].map(({ fmt, label, icon: Icon }) => (
                    <button
                      key={fmt}
                      onClick={() => handleDownload(fmt)}
                      className="btn-secondary flex items-center justify-center gap-1.5 text-xs py-2"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleDownloadArchive}
                  className="btn-primary w-full mt-2 flex items-center justify-center gap-1.5 text-xs py-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download All (.zip)
                </button>
              </div>
            </>
          )}

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Video Details</h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-text-muted">File size</dt>
                <dd className="text-text-secondary">{(data.file_size / 1024 / 1024).toFixed(1)} MB</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Format</dt>
                <dd className="text-text-secondary">{data.mime_type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Model</dt>
                <dd className="text-text-secondary">{data.model_size}</dd>
              </div>
              {data.language_confidence && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Language confidence</dt>
                  <dd className="text-text-secondary">{(data.language_confidence * 100).toFixed(0)}%</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-text-muted">Uploaded</dt>
                <dd className="text-text-secondary">{new Date(data.created_at).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>

          {status === 'completed' && (
            <button onClick={handleReprocess} className="btn-secondary w-full flex items-center justify-center gap-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              Re-transcribe
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
