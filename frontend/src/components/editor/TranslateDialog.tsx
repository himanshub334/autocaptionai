import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X, Languages, Loader2, ArrowRight } from 'lucide-react'
import api from '../../lib/api'

interface Props {
  open: boolean
  onClose: () => void
  videoId: string
  sourceLang: string
}

const LANG_NAMES: Record<string, string> = { en: 'English', hi: 'Hindi', auto: 'Auto' }

export function TranslateDialog({ open, onClose, videoId, sourceLang }: Props) {
  const queryClient = useQueryClient()
  const [targetLang, setTargetLang] = useState(sourceLang === 'hi' ? 'en' : 'hi')
  const [processing, setProcessing] = useState(false)

  async function handleTranslate() {
    setProcessing(true)
    try {
      await api.post(`/api/subtitles/${videoId}/translate`, {
        source_lang: sourceLang,
        target_lang: targetLang,
      })
      toast.success('Translation started — this runs on local open-source models and may take a moment')
      // Poll could be added; for now invalidate after a delay
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['segments', videoId] }), 8000)
      onClose()
    } catch {
      toast.error('Translation failed to start')
    } finally {
      setProcessing(false)
    }
  }

  const effectiveSource = sourceLang === 'auto' ? 'en' : sourceLang

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm card p-6 z-50 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Languages className="w-5 h-5 text-brand-400" />
              Translate Subtitles
            </Dialog.Title>
            <Dialog.Close className="btn-ghost p-1.5">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <p className="text-sm text-text-secondary mb-4">
            Translate using open-source MarianMT / NLLB models running locally — no paid translation API.
          </p>

          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="card px-4 py-3 text-center flex-1">
              <p className="text-xs text-text-muted mb-1">From</p>
              <p className="font-semibold text-text-primary">{LANG_NAMES[effectiveSource] || effectiveSource.toUpperCase()}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-text-muted mb-1 text-center">To</p>
              <select
                className="input text-center font-semibold"
                value={targetLang}
                onChange={e => setTargetLang(e.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleTranslate}
            disabled={processing || targetLang === effectiveSource}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
            {processing ? 'Starting...' : 'Translate Subtitles'}
          </button>

          {targetLang === effectiveSource && (
            <p className="text-xs text-amber-400 text-center mt-2">Source and target languages are the same</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
