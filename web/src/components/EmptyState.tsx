import { Link } from 'react-router-dom'

type Props = {
  title: string
  hint?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
}

export function EmptyState({
  title,
  hint,
  actionLabel,
  actionTo,
  onAction,
}: Props) {
  return (
    <div className="empty-state" role="status">
      <p className="empty-state-title">{title}</p>
      {hint ? <p className="empty-state-hint">{hint}</p> : null}
      {actionLabel && actionTo ? (
        <Link to={actionTo} className="btn">
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && onAction && !actionTo ? (
        <button type="button" className="btn" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
