// 52-week activity heatmap (GitHub-style). Deterministic; no per-cell anim.
export function Heatmap({ grid }) {
  const { cells, weeks, monthLabels } = grid
  return (
    <div className="heatmap">
      <div className="hm-months">
        {monthLabels.map((m) => (
          <span key={`${m.label}-${m.col}`} className="u-label" style={{ left: `${(m.col / weeks) * 100}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="hm-body">
        <div className="hm-days">
          <span className="u-label">M</span>
          <span className="u-label">W</span>
          <span className="u-label">F</span>
        </div>
        <div className="hm-grid" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>
          {cells.map((c) => (
            <i key={c.date} className={`hm-cell l${c.lvl}`} data-tip={`${c.count} note${c.count === 1 ? '' : 's'} · ${c.date}`} />
          ))}
        </div>
      </div>
      <div className="hm-legend">
        <span className="u-label">LESS</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`hm-cell l${l}`} />
        ))}
        <span className="u-label">MORE</span>
      </div>
    </div>
  )
}
