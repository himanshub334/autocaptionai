import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FolderOpen, Plus, Video, X, Loader2, Trash2 } from 'lucide-react'
import api from '../lib/api'

interface Project {
  id: string
  name: string
  description?: string
  video_count: string
  created_at: string
}

export function ProjectsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects').then(r => r.data.projects as Project[]),
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.post('/api/projects', form)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project created')
      setForm({ name: '', description: '' })
      setShowForm(false)
    } catch {
      toast.error('Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this project? Videos will not be deleted but will be unassigned.')) return
    try {
      await api.delete(`/api/projects/${id}`)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project deleted')
    } catch {
      toast.error('Delete failed')
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
          <p className="text-text-secondary mt-1">Organize your videos into projects</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary">Create Project</h3>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              className="input"
              placeholder="Project name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              autoFocus
            />
            <textarea
              className="input"
              placeholder="Description (optional)"
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
            <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      ) : !data?.length ? (
        <div className="card p-12 text-center">
          <FolderOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No projects yet</p>
          <p className="text-text-muted text-sm mt-1">Create a project to organize your videos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map(project => (
            <div key={project.id} className="card p-5 group relative">
              <button
                onClick={() => handleDelete(project.id)}
                className="absolute top-3 right-3 btn-ghost p-1.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center mb-3">
                <FolderOpen className="w-5 h-5 text-brand-400" />
              </div>
              <h3 className="font-semibold text-text-primary mb-1">{project.name}</h3>
              {project.description && (
                <p className="text-sm text-text-muted mb-3 line-clamp-2">{project.description}</p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Video className="w-3.5 h-3.5" />
                {project.video_count} video{project.video_count !== '1' ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
