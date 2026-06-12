import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import toast from 'react-hot-toast'
import { X, Film, Loader2, Download, Type, Palette, AlignCenter } from 'lucide-react'
import api from '../../lib/api'

interface Props {
  open: boolean
  onClose: () => void
  videoId: string
}

const POSITIONS = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'center', label: 'Center' },
  { value: 'top', label: 'Top' },
]

const COLORS = [
  { value: 'white', label: 'White', hex: '#FFFFFF' },
  { value: 'yellow', label: 'Yellow', hex: '#FFFF00' },
  { value: 'red', label: 'Red', hex: '#FF4444' },
  { value: 'black', label: 'Black', hex: '#000000' },
]

export function BurnInDialog({ open, onClose, videoId }: Props) {
  const [processing, setProcessing] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [options, setOptions] = useState({
    font_size: 24,
    font_color: 'white',
    bg_color: 'black@0.5',
    position: 'bottom',
    font_name: 'Arial',
  })

  async function handleBurn() {
    setProcessing(true)
    setResultUrl(null)
    try {
      const res = await api.post(`/api/subtitles/${videoId}/burn`, options)
      setResultUrl(res.data.download_url)
      toast.success('Subtitles burned into video!')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Burn-in failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md card p-6 z-50 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Film className="w-5 h-5 text-brand-400" />
              Burn Subtitles into Video
            </Dialog.Title>
            <Dialog.Close className="btn-ghost p-1.5">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <p className="text-sm text-text-secondary mb-4">
            Create a ready-to-upload video with subtitles permanently embedded — perfect for
            YouTube Shorts, Instagram Reels, and TikTok.
          </p>

          <div className="space-y-4">
            {/* Font size */}
            <div>
              <label className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <Type className="w-3.5 h-3.5" />
                Font Size: {options.font_size}px
              </label>
              <input
                type="range"
                min={14}
                max={48}
                value={options.font_size}
                onChange={e => setOptions(o => ({ ...o, font_size: Number(e.target.value) }))}
                className="w-full accent-brand-500"
              />
            </div>

            {/* Position */}
            <div>
              <label className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <AlignCenter className="w-3.5 h-3.5" />
                Position
              </label>
              <div className="grid grid-cols-3 gap-2">
                {POSITIONS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setOptions(o => ({ ...o, position: p.value }))}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      options.position === p.value
                        ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                        : 'border-surface-border text-text-secondary'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-sm text-text-secondary flex items-center gap-1.5 mb-1.5">
                <Palette className="w-3.5 h-3.5" />
                Text Color
              </label>
              <div className="grid grid-cols-4 gap-2">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setOptions(o => ({ ...o, font_color: c.value }))}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      options.font_color === c.value
                        ? 'border-brand-500 bg-brand-500/10 text-text-primary'
                        : 'border-surface-border text-text-secondary'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full border border-surface-border" style={{ background: c.hex }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {resultUrl ? (
            <a
              href={resultUrl}
              download
              className="btn-primary w-full mt-5 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Burned Video
            </a>
          ) : (
            <button
              onClick={handleBurn}
              disabled={processing}
              className="btn-primary w-full mt-5 flex items-center justify-center gap-2"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
              {processing ? 'Rendering...' : 'Burn Subtitles'}
            </button>
          )}

          {processing && (
            <p className="text-xs text-text-muted text-center mt-2">
              This uses FFmpeg locally and may take a few minutes depending on video length.
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
