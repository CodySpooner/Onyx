import { SCHEMA, PRESETS, DEFAULTS, val, resetSection } from '../lib/graph-settings.mjs'

const SECTIONS = [
  { id: 'theme', label: 'THEME' },
  { id: 'look', label: 'LOOK' },
  { id: 'motion', label: 'MOTION' },
  { id: 'physics', label: 'PHYSICS · BRAIN LENS' }
]

// Schema-driven customization drawer: every row renders from SCHEMA, so new
// settings appear here for free. ↻ marks rows that rebuild the lens.
export function CustomizeDrawer({ gset, view, onChange, onClose }) {
  const s = gset || DEFAULTS
  const needsR = (row) => !(row.liveIn === '*' || (Array.isArray(row.liveIn) && row.liveIn.includes(view)))

  const renderRow = (row) => {
    const v = val(s, row.key)
    if (row.type === 'bool') {
      return (
        <label key={row.key} className="cz-row">
          <span className="u-label">{row.label}{needsR(row) ? ' ↻' : ''}</span>
          <input type="checkbox" checked={!!v} onChange={(e) => onChange({ [row.key]: e.target.checked })} />
        </label>
      )
    }
    if (row.type === 'enum') {
      if (row.key === 'theme.preset') {
        return (
          <div key={row.key} className="cz-row cz-presets">
            <span className="u-label">{row.label} ↻</span>
            <div className="cz-preset-grid">
              {row.options.map((id) => (
                <button key={id} className={`cz-preset${v === id ? ' on' : ''}`} onClick={() => onChange({ [row.key]: id })} data-tip={PRESETS[id].name}>
                  {PRESETS[id].clusters.slice(0, 4).map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                  <span>{PRESETS[id].name.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        )
      }
      return (
        <label key={row.key} className="cz-row">
          <span className="u-label">{row.label}{needsR(row) ? ' ↻' : ''}</span>
          <select className="nl-sort" value={v} onChange={(e) => onChange({ [row.key]: e.target.value })}>
            {row.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
      )
    }
    return (
      <label key={row.key} className="cz-row">
        <span className="u-label">{row.label}{needsR(row) ? ' ↻' : ''}</span>
        <input
          type="range"
          min={row.min}
          max={row.max}
          step={row.step}
          value={v}
          onChange={(e) => onChange({ [row.key]: Number(e.target.value) })}
        />
        <span className="num cz-val">{typeof v === 'number' ? +v.toFixed(4) : v}</span>
      </label>
    )
  }

  return (
    <aside className="czdrawer glass brk">
      <div className="cz-head">
        <span className="u-label">CUSTOMIZE · {String(view).toUpperCase()} LENS</span>
        <button className="skd-close" onClick={onClose}>✕</button>
      </div>
      <div className="rule-ticks" />
      <div className="cz-body">
        {SECTIONS.map((sec) => {
          if (sec.id === 'physics' && view !== 'brain') return null
          return (
            <div key={sec.id} className="cz-sec">
              <div className="cz-sec-head">
                <span className="u-label">{sec.label}</span>
                <button className="cz-reset u-label" onClick={() => onChange(resetSection(s, sec.id))}>RESET</button>
              </div>
              {SCHEMA.filter((r) => r.section === sec.id).map(renderRow)}
            </div>
          )
        })}
        <div className="cz-foot u-label">↻ = rebuilds the lens · everything else applies live</div>
      </div>
    </aside>
  )
}
