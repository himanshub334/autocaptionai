import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import ReactPlayer from 'react-player'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Search, Scissors, Combine, Plus, Trash2,
  Save, Download, Loader2, Languages, Settings2, Film, X
} from 'lucide-react'
import api from '../lib/api'
import { BurnInDialog } from '../components/editor/BurnInDialog'
import { TranslateDialog } from '../components/editor/TranslateDialog'

interface Segment {
  id: string
  segment_index: number
  start_time: number
  end_time: number
  text: string
  speaker?: string | null
  translated_text?: string | null
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = (seconds % 60).toFixed(2)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${s.padStart(5, '0')}`
    : `${m}:${s.padStart(5, '0')}`
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const playerRef = useRef<ReactPlayer>(null)
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [currentTime, setCurrentTime] = useState(0)
  const [segments, setSegments] = useState<Segment[]>([])
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [burnDialogOpen, setBurnDialogOpen] = useState(false)
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: video } = useQuery({
    queryKey: ['video', id],
    queryFn: () => api.get(`/api/videos/${id}`).then(r => r.data.video),
  })

  const { data: segData, isLoading } = useQuery({
    queryKey: ['segments', id],
    queryFn: () => api.get(`/api/subtitles/${id}/segments`).then(r => r.data.segments as Segment[]),
  })

  useEffect(() => {
    if (segData) setSegments(segData)
  }, [segData])

  // Find active segment based on playback time
  const activeSegment = useMemo(() => {
    return segments.find(s => currentTime >= s.start_time && currentTime <= s.end_time)
  }, [currentTime, segments])

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegment && segmentRefs.current[activeSegment.id]) {
      segmentRefs.current[activeSegment.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSegment?.id])

  function updateSegment(segId: string, updates: Partial<Segment>) {
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, ...updates } : s))
    setDirty(prev => new Set(prev).add(segId))
  }

  function seekTo(time: number) {
    playerRef.current?.seekTo(time, 'seconds')
  }

  async function saveSegment(seg: Segment) {
    await api.put(`/api/subtitles/${id}/segments/${seg.id}`, {
      text: seg.text,
      start_time: seg.start_time,
      end_time: seg.end_time,
    })
  }

  async function handleSaveAll() {
    if (dirty.size === 0) return
    setSaving(true)
    try {
      const toSave = segments.filter(s => dirty.has(s.id))
      await Promise.all(toSave.map(saveSegment))
      setDirty(new Set())
      toast.success(`Saved ${toSave.length} change${toSave.length > 1 ? 's' : ''}`)
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSplit(seg: Segment) {
    const mid = (seg.start_time + seg.end_time) / 2
    const words = seg.text.trim().split(/\s+/)
    const half = Math.ceil(words.length / 2)
    const firstHalf = words.slice(0, half).join(' ')
    const secondHalf = words.slice(half).join(' ')

    try {
      // Update current segment to first half
      await api.put(`/api/subtitles/${id}/segments/${seg.id}`, {
        text: firstHalf, end_time: mid,
      })
      // Create new segment for second half
      await api.post(`/api/subtitles/${id}/segments`, {
        text: secondHalf, start_time: mid, end_time: seg.end_time,
      })
      queryClient.invalidateQueries({ queryKey: ['segments', id] })
      toast.success('Segment split')
    } catch {
      toast.error('Split failed')
    }
  }

  async function handleMerge(seg: Segment, nextSeg: Segment) {
    try {
      await api.put(`/api/subtitles/${id}/segments/${seg.id}`, {
        text: `${seg.text.trim()} ${nextSeg.text.trim()}`,
        end_time: nextSeg.end_time,
      })
      await api.delete(`/api/subtitles/${id}/segments/${nextSeg.id}`)
      queryClient.invalidateQueries({ queryKey: ['segments', id] })
      toast.success('Segments merged')
    } catch {
      toast.error('Merge failed')
    }
  }

  async function handleDeleteSegment(segId: string) {
    try {
      await api.delete(`/api/subtitles/${id}/segments/${segId}`)
      setSegments(prev => prev.filter(s => s.id !== segId))
      toast.success('Segment deleted')
    } catch {
      toast.error('Delete failed')
    }
  }

  async function handleAddSegment() {
    const lastSeg = segments[segments.length - 1]
    const start = lastSeg ? lastSeg.end_time : currentTime
    try {
      const res = await api.post(`/api/subtitles/${id}/segments`, {
        text: 'New subtitle text',
        start_time: start,
        end_time: start + 2,
      })
      setSegments(prev => [...prev, res.data.segment])
      toast.success('Segment added')
    } catch {
      toast.error('Add failed')
    }
  }

  async function handleSearchReplace() {
    if (!searchTerm) return
    try {
      const res = await api.post(`/api/subtitles/${id}/search-replace`, {
        search: searchTerm, replace: replaceTerm,
      })
      queryClient.invalidateQueries({ queryKey: ['segments', id] })
      toast.success(`Replaced in ${res.data.updated_count} segment(s)`)
      setSearchOpen(false)
      setSearchTerm('')
      setReplaceTerm('')
    } catch {
      toast.error('Search & replace failed')
    }
  }

  async function handleDownload(format: string) {
    try {
      const res = await api.get(`/api/subtitles/${id}/download/${format}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `${video?.original_name?.replace(/\.[^.]+$/, '')}.${format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Download failed')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="h-14 flex items-center gap-3 px-5 border-b border-surface-border bg-surface-card shrink-0">
        <Link to={`/videos/${id}`} className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{video?.original_name}</p>
        </div>

        <button onClick={() => setSearchOpen(!searchOpen)} className="btn-ghost p-2" title="Search & Replace">
          <Search className="w-4 h-4" />
        </button>
        <button onClick={() => setTranslateDialogOpen(true)} className="btn-ghost p-2" title="Translate">
          <Languages className="w-4 h-4" />
        </button>
        <button onClick={() => setBurnDialogOpen(true)} className="btn-ghost p-2" title="Burn subtitles into video">
          <Film className="w-4 h-4" />
        </button>

        <div className="relative group">
          <button className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <div className="absolute right-0 top-full mt-1 w-32 card p-1 hidden group-hover:block z-20">
            {['srt', 'vtt', 'txt', 'json'].map(fmt => (
              <button
                key={fmt}
                onClick={() => handleDownload(fmt)}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-surface-hover text-text-secondary"
              >
                .{fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={dirty.size === 0 || saving}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save {dirty.size > 0 && `(${dirty.size})`}
        </button>
      </div>

      {/* Search/Replace bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-surface-border bg-surface-card animate-slide-up">
          <input
            className="input flex-1 max-w-xs"
            placeholder="Search..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            autoFocus
          />
          <input
            className="input flex-1 max-w-xs"
            placeholder="Replace with..."
            value={replaceTerm}
            onChange={e => setReplaceTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearchReplace()}
          />
          <button onClick={handleSearchReplace} className="btn-primary text-xs px-3 py-1.5">
            Replace All
          </button>
          <button onClick={() => setSearchOpen(false)} className="btn-ghost p-1.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video player */}
        <div className="w-[40%] min-w-[320px] p-5 flex flex-col">
          <div className="card overflow-hidden bg-black aspect-video relative">
            {video?.playback_url && (
              <ReactPlayer
                ref={playerRef}
                url={video.playback_url}
                controls
                width="100%"
                height="100%"
                onProgress={({ playedSeconds }) => setCurrentTime(playedSeconds)}
                progressInterval={200}
              />
            )}
            {/* Live subtitle preview overlay */}
            {activeSegment && (
              <div className="absolute bottom-12 left-0 right-0 flex justify-center px-4 pointer-events-none">
                <div className="bg-black/70 text-white text-sm px-3 py-1.5 rounded text-center max-w-[90%]">
                  {activeSegment.translated_text || activeSegment.text}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 card p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Editor Tips</h3>
            <ul className="text-xs text-text-muted space-y-1.5">
              <li>• Click any subtitle to jump to that point in the video</li>
              <li>• Use <Scissors className="w-3 h-3 inline" /> to split a segment at its midpoint</li>
              <li>• Use <Combine className="w-3 h-3 inline" /> to merge with the next segment</li>
              <li>• Edits are highlighted until saved — click "Save" to persist</li>
            </ul>
          </div>
        </div>

        {/* Segments list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary">
              {segments.length} segment{segments.length !== 1 ? 's' : ''}
            </h2>
            <button onClick={handleAddSegment} className="btn-ghost text-xs flex items-center gap-1.5 px-2 py-1">
              <Plus className="w-3.5 h-3.5" />
              Add segment
            </button>
          </div>

          {segments.map((seg, idx) => {
            const isActive = activeSegment?.id === seg.id
            const isDirty = dirty.has(seg.id)
            const nextSeg = segments[idx + 1]

            return (
              <div
                key={seg.id}
                ref={el => { segmentRefs.current[seg.id] = el }}
                className={`subtitle-segment card p-3 ${isActive ? 'active' : ''} ${isDirty ? 'border-amber-500/40' : ''}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => seekTo(seg.start_time)}
                    className="text-xs font-mono text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    {formatTime(seg.start_time)}
                  </button>
                  <span className="text-text-muted text-xs">→</span>
                  <button
                    onClick={() => seekTo(seg.end_time)}
                    className="text-xs font-mono text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    {formatTime(seg.end_time)}
                  </button>

                  {seg.speaker && (
                    <span className="badge-default text-[10px] ml-1">{seg.speaker}</span>
                  )}

                  <div className="flex-1" />

                  <button
                    onClick={() => handleSplit(seg)}
                    className="btn-ghost p-1"
                    title="Split segment"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                  </button>
                  {nextSeg && (
                    <button
                      onClick={() => handleMerge(seg, nextSeg)}
                      className="btn-ghost p-1"
                      title="Merge with next"
                    >
                      <Combine className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteSegment(seg.id)}
                    className="btn-ghost p-1 hover:text-red-400"
                    title="Delete segment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <textarea
                  value={seg.text}
                  onChange={e => updateSegment(seg.id, { text: e.target.value })}
                  rows={1}
                  className="w-full bg-transparent text-sm text-text-primary resize-none focus:outline-none focus:bg-surface-hover rounded px-1 -mx-1 transition-colors"
                  onInput={e => {
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = el.scrollHeight + 'px'
                  }}
                />

                {seg.translated_text && (
                  <p className="text-xs text-mint-400 mt-1.5 italic">{seg.translated_text}</p>
                )}
              </div>
            )
          })}

          {segments.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-secondary">No subtitle segments found</p>
              <button onClick={handleAddSegment} className="btn-primary mt-3 text-sm">
                Add first segment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <BurnInDialog
        open={burnDialogOpen}
        onClose={() => setBurnDialogOpen(false)}
        videoId={id!}
      />
      <TranslateDialog
        open={translateDialogOpen}
        onClose={() => setTranslateDialogOpen(false)}
        videoId={id!}
        sourceLang={video?.detected_language || 'en'}
      />
    </div>
  )
}
