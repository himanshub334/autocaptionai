import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Captions, Zap, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const { setTokens } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : form
      const res = await api.post(endpoint, payload)
      setTokens(res.data.accessToken, res.data.refreshToken, res.data.user)
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created!')
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Left panel: branding */}
      <div className="hidden lg:flex flex-col w-1/2 bg-surface-card border-r border-surface-border p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-mint-400/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-3 mb-16">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-mint-400 flex items-center justify-center">
            <Captions className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-xl text-text-primary">AutoCaption</span>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-mint-400" />
              <span className="text-xs text-mint-400 font-semibold">AI</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h1 className="text-4xl font-bold text-text-primary mb-4 leading-tight">
            Generate perfect<br />
            <span className="bg-gradient-to-r from-brand-400 to-mint-400 bg-clip-text text-transparent">
              captions with AI
            </span>
          </h1>
          <p className="text-text-secondary text-lg mb-8">
            100% open-source. No paid APIs. Powered by Whisper running locally on your infrastructure.
          </p>

          <div className="space-y-4">
            {[
              { icon: '🎯', title: 'Whisper AI Transcription', desc: 'Faster-Whisper for accurate, local STT' },
              { icon: '🌐', title: 'Multi-language Support', desc: 'English, Hindi, Hinglish and 90+ languages' },
              { icon: '✂️', title: 'Professional Editor', desc: 'Edit, split, merge, translate subtitles' },
              { icon: '🎬', title: 'Burn-in Export', desc: 'Embed subtitles directly into your video' },
            ].map((feat) => (
              <div key={feat.title} className="flex items-start gap-3">
                <span className="text-xl">{feat.icon}</span>
                <div>
                  <p className="text-sm font-medium text-text-primary">{feat.title}</p>
                  <p className="text-xs text-text-muted">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-text-muted">
          Open-source · Self-hosted · Zero API costs
        </p>
      </div>

      {/* Right panel: form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-mint-400 flex items-center justify-center">
              <Captions className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-text-primary">AutoCaption AI</span>
          </div>

          <h2 className="text-2xl font-bold text-text-primary mb-1">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h2>
          <p className="text-text-secondary mb-8 text-sm">
            {mode === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-brand-400 hover:text-brand-300 font-medium"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <label className="block text-sm text-text-secondary mb-1.5">Full Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Himanshu Sharma"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder={mode === 'register' ? 'Min 8 chars, include a number' : '••••••••'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
