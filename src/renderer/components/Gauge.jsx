export function Gauge({ value, label, size = 80 }) {
  const r = size * 0.4
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const dash = (pct / 100) * c
  const mid = size / 2
  const stroke = Math.max(5, Math.round(size * 0.0875))
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={mid} cy={mid} r={r} className="gauge-track" style={{ strokeWidth: stroke }} />
        <circle
          cx={mid}
          cy={mid}
          r={r}
          className="gauge-fill"
          style={{ strokeWidth: stroke }}
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      <div className="gauge-center">
        <b style={size >= 100 ? { fontSize: Math.round(size * 0.27) } : undefined}>{Math.round(value)}</b>
        <span>{label}</span>
      </div>
    </div>
  )
}
