import { Loader2, CheckCircle2, XCircle, Clock, Ban } from 'lucide-react'

const config: Record<string, { cls: string; icon: any; label: string }> = {
  uploaded:   { cls: 'badge-default', icon: Clock,        label: 'Uploaded' },
  queued:     { cls: 'badge-info',    icon: Clock,        label: 'Queued' },
  processing: { cls: 'badge-warning', icon: Loader2,      label: 'Processing' },
  completed:  { cls: 'badge-success', icon: CheckCircle2, label: 'Completed' },
  failed:     { cls: 'badge-error',   icon: XCircle,      label: 'Failed' },
  cancelled:  { cls: 'badge-default', icon: Ban,          label: 'Cancelled' },
}

export function VideoStatusBadge({ status }: { status: string }) {
  const c = config[status] || config.uploaded
  const Icon = c.icon
  return (
    <span className={c.cls}>
      <Icon className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {c.label}
    </span>
  )
}
