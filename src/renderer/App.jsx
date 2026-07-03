import { useEffect, useState } from 'react'
import { SpaceCanvas } from './views/SpaceCanvas.jsx'
import { NoteReader } from './components/NoteReader.jsx'

export default function App() {
  const [graph, setGraph] = useState(null)
  const [selected, setSelected] = useState(null)
  const [view] = useState('solar')

  useEffect(() => {
    window.onyx.getGraph().then(setGraph)
    return window.onyx.onGraphUpdate(setGraph)
  }, [])

  // ponytail: verification hook so automated screenshots can drive the UI
  useEffect(() => {
    window.__onyxDebug = { select: setSelected }
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

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">◑ Onyx</span>
        <span className="stats">
          {graph.meta.noteCount} notes · {graph.meta.linkCount} links
        </span>
        <div className="spacer" />
        <button onClick={() => window.onyx.pickVault().then(setGraph)}>Change vault</button>
      </header>
      <SpaceCanvas view={view} graph={graph} activeIds={null} onSelect={setSelected} />
      {selected && (
        <NoteReader id={selected} graph={graph} onSelect={setSelected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
