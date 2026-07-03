import { useEffect, useState } from 'react'
import { matchFilter } from './lib/graph.mjs'
import { SpaceCanvas } from './views/SpaceCanvas.jsx'
import { NoteReader } from './components/NoteReader.jsx'
import { SearchFilter } from './components/SearchFilter.jsx'
import { ViewSwitcher } from './views/ViewSwitcher.jsx'

const EMPTY_FILTER = { q: '', folders: [], types: [], statuses: [], tags: [] }

export default function App() {
  const [graph, setGraph] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [view, setView] = useState('solar')

  useEffect(() => {
    window.onyx.getGraph().then(setGraph)
    return window.onyx.onGraphUpdate(setGraph)
  }, [])

  // ponytail: verification hook so automated screenshots can drive the UI
  useEffect(() => {
    window.__onyxDebug = { select: setSelected, setFilter, setView }
  }, [])

  if (!graph) {
    return (
      <div className="empty">
        <h1>◑ Onyx</h1>
        <p>loading vault…</p>
      </div>
    )
  }

  if (!graph.notes.length) {
    return (
      <div className="empty">
        <h1>◑ Onyx</h1>
        <p>No notes found in this folder.</p>
        <button onClick={() => window.onyx.pickVault().then(setGraph)}>Choose vault folder</button>
      </div>
    )
  }

  const activeIds = new Set(graph.notes.filter((n) => matchFilter(n, filter)).map((n) => n.id))
  const filtering = activeIds.size !== graph.notes.length

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">◑ Onyx</span>
        <span className="stats">
          {graph.meta.noteCount} notes · {graph.meta.linkCount} links
        </span>
        <div className="spacer" />
        <ViewSwitcher view={view} onChange={setView} />
        <button onClick={() => window.onyx.pickVault().then(setGraph)}>Change vault</button>
      </header>
      <SearchFilter graph={graph} filter={filter} onChange={setFilter} />
      <SpaceCanvas view={view} graph={graph} activeIds={filtering ? activeIds : null} onSelect={setSelected} />
      {selected && (
        <NoteReader id={selected} graph={graph} onSelect={setSelected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
