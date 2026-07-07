import { useEffect, useState } from 'react'
import { matchFilter } from './lib/graph.mjs'
import { vaultStats } from './lib/stats.mjs'
import { SpaceCanvas } from './views/SpaceCanvas.jsx'
import { ViewSwitcher } from './views/ViewSwitcher.jsx'
import { NoteReader } from './components/NoteReader.jsx'
import { HudSidebar } from './components/HudSidebar.jsx'
import { FolderTabs } from './components/FolderTabs.jsx'
import { HudToolbar } from './components/HudToolbar.jsx'
import { UpdateToast } from './components/UpdateToast.jsx'

const EMPTY_FILTER = { q: '', folders: [], types: [], statuses: [], tags: [] }

export default function App() {
  const [graph, setGraph] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [view, setView] = useState('solar')
  const [showAllLinks, setShowAllLinks] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)

  useEffect(() => {
    window.onyx.getGraph().then(setGraph)
    return window.onyx.onGraphUpdate(setGraph)
  }, [])

  useEffect(() => {
    window.onyx.getConfig().then((c) => {
      setShowAllLinks(c.showAllLinks)
      setShowLabels(c.showLabels)
    })
  }, [])

  // ponytail: verification hook so automated screenshots can drive the UI
  useEffect(() => {
    window.__onyxDebug = { select: setSelected, setFilter, setView, setShowAllLinks, setShowLabels }
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
  const stats = vaultStats(graph)
  const featured = graph.notes.find((n) => n.id === selected) || stats.hubs[0]

  const toggleLinks = () => {
    const next = !showAllLinks
    setShowAllLinks(next)
    window.onyx.setConfig({ showAllLinks: next })
  }
  const toggleLabels = () => {
    const next = !showLabels
    setShowLabels(next)
    window.onyx.setConfig({ showLabels: next })
  }
  const handleCreate = async () => {
    const folder = filter.folders[0] || '(root)'
    const id = await window.onyx.createNote(folder, 'Untitled')
    if (id) {
      setGraph(await window.onyx.getGraph())
      setSelected(id)
    }
  }

  return (
    <div className="app hud">
      <div className="stage">
        <SpaceCanvas
          view={view}
          graph={graph}
          activeIds={filtering ? activeIds : null}
          onSelect={setSelected}
          showAllLinks={showAllLinks}
          showLabels={showLabels}
          resetNonce={resetNonce}
        />
      </div>
      <header className="topbar">
        <span className="brand">◑ Onyx</span>
        <span className="stats">
          {graph.meta.noteCount} notes · {graph.meta.linkCount} links
        </span>
        <div className="spacer" />
        <ViewSwitcher view={view} onChange={setView} />
        <button onClick={() => window.onyx.pickVault().then(setGraph)}>Change vault</button>
      </header>
      <FolderTabs graph={graph} filter={filter} onChange={setFilter} />
      <div className="hud-body">
        <HudSidebar
          graph={graph}
          stats={stats}
          filter={filter}
          onFilter={setFilter}
          featured={featured}
          onSelect={setSelected}
          onCreate={handleCreate}
        />
        <div className="hud-spacer" />
        <HudToolbar
          showAllLinks={showAllLinks}
          onLinks={toggleLinks}
          showLabels={showLabels}
          onLabels={toggleLabels}
          onReset={() => setResetNonce((n) => n + 1)}
        />
      </div>
      {selected && (
        <NoteReader id={selected} graph={graph} onSelect={setSelected} onClose={() => setSelected(null)} />
      )}
      <UpdateToast />
    </div>
  )
}
