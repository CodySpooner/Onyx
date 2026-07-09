// monochrome glyphs only — full-color emoji breaks the HUD's glyph discipline
const VIEWS = [
  { id: 'brain', label: '◍ Brain' },
  { id: 'nexus', label: '❖ Nexus Core' },
  { id: 'atlas', label: '◈ Atlas' },
  { id: 'stacks', label: '▤ Stacks' },
  { id: 'transit', label: '⊟ Transit Map' },
  { id: 'corkboard', label: '▦ Corkboard' },
  { id: 'mycelium', label: '❦ Mycelium' },
  { id: 'topography', label: '◭ Topography' },
  { id: 'solar', label: '☀ Solar System' },
  { id: 'core', label: '◉ Core of Everything' },
  { id: 'globe', label: '⊕ Second Brain' }
]

export function ViewSwitcher({ view, onChange }) {
  return (
    <select className="viewswitch" value={view} onChange={(e) => onChange(e.target.value)}>
      {VIEWS.map((v) => (
        <option key={v.id} value={v.id}>
          {v.label}
        </option>
      ))}
    </select>
  )
}
