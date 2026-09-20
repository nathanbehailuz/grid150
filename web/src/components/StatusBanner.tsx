type Props = {
  tone?: 'error' | 'ok' | 'info'
  message: string
  onRetry?: () => void
}

export function StatusBanner({ tone = 'error', message, onRetry }: Props) {
  return (
    <div
      className={`status-banner status-banner-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="ghost" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}
