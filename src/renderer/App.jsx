import { useEffect, useMemo, useRef, useState } from 'react'
import { matchFilter } from './lib/graph.mjs'
import { vaultStats } from './lib/stats.mjs'
import { detectClusters } from './lib/clusters.mjs'
import { buildSkillStats, evaluateSkills } from './lib/skills.mjs'
import { bus } from './lib/bus.mjs'
import { SpaceCanvas } from './views/SpaceCanvas.jsx'
import { NoteReader } from './components/NoteReader.jsx'
import { HudSidebar } from './components/HudSidebar.jsx'
import { FolderTabs } from './components/FolderTabs.jsx'
import { HudToolbar } from './components/HudToolbar.jsx'
import { UpdateToast } from './components/UpdateToast.jsx'
import { Cockpit } from './components/Cockpit.jsx'
import { TopBar } from './components/TopBar.jsx'
import { StatusBar } from './components/StatusBar.jsx'
import { Toasts } from './components/Toasts.jsx'
import { HoverLayer } from './components/HoverLayer.jsx'
import { BootSequence } from './components/BootSequence.jsx'

const EMPTY_FILTER = { q: '', folders: [], types: [], statuses: [], tags: [] }

export default function App() {
  const [graph, setGraph] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [view, setView] = useState('brain')
  const [mode, setMode] = useState('brain')
  const [overlay, setOverlay] = useState(null) // null | 'palette' | 'capture'
  const [showAllLinks, setShowAllLinks] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [usage, setUsage] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    window.onyx.getGraph().then(setGraph)
    return window.onyx.onGraphUpdate(setGraph)
  }, [])

  useEffect(() => {
    window.onyx.getConfig().then((c) => {
      setCfg(c)
      setShowAllLinks(c.showAllLinks)
      setShowLabels(c.showLabels)
    })
    window.onyx.getUsage?.().then(setUsage)
  }, [])

  // ponytail: verification hook so automated screenshots can drive the UI
  useEffect(() => {
    window.__onyxDebug = {
      select: setSelected,
      setFilter,
      setView,
      setMode,
      setOverlay,
      setShowAllLinks,
      setShowLabels,
      hover: (id) => bus.emit('hover', { id, x: 620, y: 320, pinned: true })
    }
  }, [])

  // hoisted graph-derived data (computed once per graph)
  const stats = useMemo(() => (graph ? vaultStats(graph) : null), [graph])
  const clusters = useMemo(
    () => (graph ? detectClusters(graph.notes.map((n) => n.id), graph.links) : { clusterCount: 0, clusterOf: new Map() }),
    [graph]
  )
  const evaluated = useMemo(
    () => (graph ? evaluateSkills(buildSkillStats(graph, usage, Date.now())) : null),
    [graph, usage]
  )

  // keyboard contract — one listener; handler reads fresh state via ref
  const kbRef = useRef({})
  kbRef.current = { overlay, selected, mode }
  useEffect(() => {
    const onKey = (e) => {
      const k = kbRef.current
      const inInput = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOverlay((o) => (o === 'palette' ? null : 'palette'))
        return
      }
      if (e.ctrlKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        setMode(['brain', 'dashboard', 'skills'][+e.key - 1])
        return
      }
      if (e.key === 'Escape' && !inInput) {
        if (k.overlay) setOverlay(null)
        else if (k.selected) setSelected(null)
        else bus.emit('hover', null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!graph) {
    return <BootSequence graph={null} clusterCount={0} vaultPath={cfg?.vaultPath || ''} onDone={() => {}} />
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
      window.onyx.bumpUsage?.('noteCreate').then(setUsage)
    }
  }
  const changeView = (v) => {
    setView(v)
    window.onyx.bumpUsage?.(`view.${v}`).then(setUsage)
  }

  return (
    <div className="app hud">
      <div className={`stage ${mode !== 'brain' ? 'dimmed' : ''}`}>
        <SpaceCanvas
          view={view}
          graph={graph}
          activeIds={filtering ? activeIds : null}
          onSelect={setSelected}
          onHover={(h) => bus.emit('hover', h)}
          showAllLinks={showAllLinks}
          showLabels={showLabels}
          resetNonce={resetNonce}
          paused={mode !== 'brain'}
        />
      </div>
      <TopBar
        mode={mode}
        onMode={setMode}
        view={view}
        onView={changeView}
        onSearch={() => setOverlay('palette')}
        skillTab={evaluated ? { level: evaluated.level, levelPct: evaluated.levelPct, title: evaluated.title } : null}
      />
      {mode === 'brain' && (
        <>
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
            <Cockpit graph={graph} clusters={clusters} onSelect={setSelected} />
            <HudToolbar
              showAllLinks={showAllLinks}
              onLinks={toggleLinks}
              showLabels={showLabels}
              onLabels={toggleLabels}
              onReset={() => setResetNonce((n) => n + 1)}
            />
          </div>
          <HoverLayer graph={graph} />
        </>
      )}
      {mode === 'dashboard' && (
        <div className="mode-scrim">
          <div className="mode-placeholder">DASHBOARD · ONLINE IN C3</div>
        </div>
      )}
      {mode === 'skills' && (
        <div className="mode-scrim">
          <div className="mode-placeholder">CORTEX · ONLINE IN C3</div>
        </div>
      )}
      {selected && (
        <NoteReader id={selected} graph={graph} onSelect={setSelected} onClose={() => setSelected(null)} />
      )}
      <StatusBar
        graph={graph}
        clusterCount={clusters.clusterCount}
        vaultPath={cfg?.vaultPath || ''}
        onPickVault={() => window.onyx.pickVault().then(setGraph)}
      />
      <Toasts />
      <div className="scanlines" aria-hidden />
      <UpdateToast />
      {booting && (
        <BootSequence
          graph={graph}
          clusterCount={clusters.clusterCount}
          vaultPath={cfg?.vaultPath || ''}
          onDone={() => setBooting(false)}
        />
      )}
    </div>
  )
}
