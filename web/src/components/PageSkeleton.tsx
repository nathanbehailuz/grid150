type Props = {
  rows?: number
  label?: string
}

export function PageSkeleton({ rows = 4, label = 'Loading' }: Props) {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label={label}>
      <div className="skeleton-block skeleton-title" />
      <div className="skeleton-block skeleton-subtitle" />
      <div className="panel skeleton-panel">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton-row">
            <div className="skeleton-block skeleton-line wide" />
            <div className="skeleton-block skeleton-line narrow" />
          </div>
        ))}
      </div>
    </div>
  )
}
