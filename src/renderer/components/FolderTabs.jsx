import { cleanFolder } from '../lib/stats.js'

export function FolderTabs({ graph, filter, onChange }) {
  const active = filter.folders[0] || null
  const set = (id) => onChange({ ...filter, folders: id ? [id] : [] })
  return (
    <div className="foldertabs">
      <button className={`ftab ${!active ? 'on' : ''}`} onClick={() => set(null)}>
        ALL
      </button>
      {graph.folders.map((f) => (
        <button
          key={f.id}
          className={`ftab ${active === f.id ? 'on' : ''}`}
          onClick={() => set(active === f.id ? null : f.id)}
        >
          <i style={{ background: f.color }} />
          {cleanFolder(f.name)}
        </button>
      ))}
    </div>
  )
}
