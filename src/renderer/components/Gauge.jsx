export function Gauge({ value, label }) {
  const r = 32
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const dash = (pct / 100) * c
  return (
    <div className="gauge">
      <svg viewBox="0 0 80 80" width="80" height="80">
        <circle cx="40" cy="40" r={r} className="gauge-track" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="gauge-fill"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="gauge-center">
        <b>{Math.round(value)}</b>
        <span>{label}</span>
      </div>
    </div>
  )
}
