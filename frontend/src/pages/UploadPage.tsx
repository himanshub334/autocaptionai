import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Upload, Video, X, FileVideo, Loader2,
  ChevronDown, Zap, Languages, Mic2
} from 'lucide-react'
import api from '../lib/api'

const ACCEPTED_TYPES = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
}

const MODEL_OPTIONS = [
  { value: 'tiny', label: 'Tiny', desc: 'Fastest · Less accurate' },
  { value: 'base', label: 'Base', desc: 'Balanced (recommended)' },
  { value: 'small', label: 'Small', desc: 'Better accuracy · Slower' },
  { value: 'medium', label: 'Medium', desc: 'High accuracy · Requires more RAM' },
  { value: 'large-v3', label: 'Large v3', desc: 'Best quality · Slowest' },
]

export function UploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [options, setOptions] = useState({
    language: 'auto',
    model_size: 'base',
    enable_diarization: false,
  })

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024, // 500MB
  })

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('video', file)
    formData.append('language', options.language)
    formData.append('model_size', options.model_size)
    formData.append('enable_diarization', String(options.enable_diarization))

    try {
      const res = await api.post('/api/videos/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setUploadProgress(Math.round((e.loaded * 100) / (e.total || 1)))
        },
      })

      toast.success('Video uploaded! Transcription starting...')
      navigate(`/videos/${res.data.video_id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload failed')
      setUploading(false)
    }
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Upload Video</h1>
        <p className="text-text-secondary mt-1">MP4, MOV, AVI, MKV, or WebM · Max 500MB</p>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200
          ${isDragActive
            ? 'border-brand-500 bg-brand-500/5 drop-zone-active'
            : file
            ? 'border-mint-400/50 bg-mint-400/5'
            : 'border-surface-border hover:border-brand-500/50 hover:bg-surface-hover'
          }
        `}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-mint-400/10 flex items-center justify-center">
                <FileVideo className="w-7 h-7 text-mint-400" />
              </div>
              <div>
                <p className="font-medium text-text-primary">{file.name}</p>
                <p className="text-sm text-text-muted">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
                Remove file
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                isDragActive ? 'bg-brand-500/20' : 'bg-surface-hover'
              }`}>
                <Upload className={`w-7 h-7 ${isDragActive ? 'text-brand-400' : 'text-text-muted'}`} />
              </div>
              <div>
                <p className="font-medium text-text-primary">
                  {isDragActive ? 'Drop your video here' : 'Drag & drop your video'}
                </p>
                <p className="text-sm text-text-muted mt-0.5">or click to browse files</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Options */}
      <div className="mt-6 card p-6 space-y-5">
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <Zap className="w-4 h-4 text-brand-400" />
          Transcription Options
        </h3>

        {/* Language */}
        <div>
          <label className="block text-sm text-text-secondary mb-1.5 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5" />
            Language
          </label>
          <select
            className="input"
            value={options.language}
            onChange={e => setOptions(o => ({ ...o, language: e.target.value }))}
          >
            <option value="auto">Auto Detect</option>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm text-text-secondary mb-1.5">Whisper Model</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {MODEL_OPTIONS.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => setOptions(o => ({ ...o, model_size: m.value }))}
                className={`p-2 rounded-lg border text-xs font-medium transition-colors text-center
                  ${options.model_size === m.value
                    ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                    : 'border-surface-border text-text-secondary hover:border-surface-hover'
                  }`}
              >
                <div className="font-semibold">{m.label}</div>
                <div className="text-[10px] mt-0.5 text-text-muted">{m.desc.split('·')[0].trim()}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Diarization */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Mic2 className="w-3.5 h-3.5 text-text-secondary" />
              <span className="text-sm text-text-secondary font-medium">Speaker Diarization</span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">Identify different speakers (requires more processing)</p>
          </div>
          <button
            type="button"
            onClick={() => setOptions(o => ({ ...o, enable_diarization: !o.enable_diarization }))}
            className={`relative w-10 h-5.5 rounded-full transition-colors ${
              options.enable_diarization ? 'bg-brand-500' : 'bg-surface-border'
            }`}
            style={{ height: '22px', width: '40px' }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform shadow-sm ${
                options.enable_diarization ? 'translate-x-[18px]' : ''
              }`}
              style={{ width: '18px', height: '18px' }}
            />
          </button>
        </div>
      </div>

      {/* Upload button */}
      <div className="mt-6">
        {uploading ? (
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
              <span className="text-sm text-text-primary font-medium">
                {uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : 'Processing...'}
              </span>
            </div>
            <div className="w-full bg-surface-hover rounded-full h-1.5 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-500 to-mint-400 rounded-full"
                animate={{ width: `${uploadProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={handleUpload}
            disabled={!file}
            className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            {file ? 'Start Transcription' : 'Select a video file'}
          </button>
        )}
      </div>
    </div>
  )
}
