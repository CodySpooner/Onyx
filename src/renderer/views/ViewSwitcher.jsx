const VIEWS = [
  { id: 'brain', label: '🧠 Brain' },
  { id: 'solar', label: '☀ Solar System' },
  { id: 'core', label: '◉ Core of Everything' },
  { id: 'globe', label: '⊕ Second Brain' },
  { id: 'constellation', label: '✦ Constellation' }
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
