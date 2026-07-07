import { useEffect, useMemo, useRef, useState } from 'react'
import { matchFilter } from './lib/graph.mjs'
import { vaultStats } from './lib/stats.mjs'
import { detectClusters } from './lib/clusters.mjs'
import { buildGraphSkillStats, mergeUsageStats, evaluateSkills } from './lib/skills.mjs'
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
import { DashboardMode } from './modes/DashboardMode.jsx'
import { SkillsMode } from './modes/SkillsMode.jsx'
import { CommandPalette } from './components/CommandPalette.jsx'
import { QuickCapture } from './components/QuickCapture.jsx'
import { dailyId, dailyTemplate, appendCapture } from './lib/daily.mjs'

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
  const [bootTimedOut, setBootTimedOut] = useState(false)
  const [pins, setPins] = useState([])
  const [flyTo, setFlyTo] = useState(null)
  const lastOpened = useRef(null)
  const announced = useRef(new Set()) // unlock toasts already shown this session

  // if the vault can't be scanned (bad path, fresh install), don't hang the
  // boot screen forever — fall through to the vault picker
  useEffect(() => {
    if (graph) return
    const t = setTimeout(() => setBootTimedOut(true), 4000)
    return () => clearTimeout(t)
  }, [graph])

  useEffect(() => {
    window.onyx.getGraph().then(setGraph)
    return window.onyx.onGraphUpdate(setGraph)
  }, [])

  useEffect(() => {
    window.onyx.getConfig().then((c) => {
      setCfg(c)
      setShowAllLinks(c.showAllLinks)
      setShowLabels(c.showLabels)
      setPins(Array.isArray(c.pins) ? c.pins : [])
    })
    window.onyx.getUsage?.().then(setUsage)
  }, [])

  // debounced search counter (Explorer branch fuel)
  useEffect(() => {
    if (!filter.q) return
    const t = setTimeout(() => window.onyx.bumpUsage?.('search').then(setUsage), 1000)
    return () => clearTimeout(t)
  }, [filter.q])

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
  // expensive graph-only half memoized on [graph]; cheap usage merge per bump
  const graphSkillStats = useMemo(() => (graph ? buildGraphSkillStats(graph, Date.now()) : null), [graph])
  const evaluated = useMemo(
    () => (graphSkillStats ? evaluateSkills(mergeUsageStats(graphSkillStats, usage, Date.now())) : null),
    [graphSkillStats, usage]
  )

  // unlock-diff: toast + persist newly unlocked skills (announced ref makes
  // it idempotent while a bumpUsage response is still in flight)
  useEffect(() => {
    if (!evaluated || !usage) return
    const fresh = evaluated.skills.filter(
      (s) => s.unlocked && !usage.unlockedAt?.[s.id] && !announced.current.has(s.id)
    )
    if (!fresh.length) return
    for (const s of fresh) announced.current.add(s.id)
    if (fresh.length > 3) {
      bus.emit('toast', { msg: `◆ ${fresh.length} SKILLS UNLOCKED · +${fresh.length * 50} XP`, kind: 'skill' })
    } else {
      for (const s of fresh) bus.emit('toast', { msg: `◆ SKILL UNLOCKED — ${s.name} · +50 XP`, kind: 'skill' })
    }
    window.onyx.markUnlocked?.(fresh.map((s) => s.id)).then(setUsage)
  }, [evaluated, usage])

  // keyboard contract — one listener; handler reads fresh state via ref
  // (merge-assign: callbacks like openDaily and the dirty flag must survive renders)
  const kbRef = useRef({})
  Object.assign(kbRef.current, { overlay, selected, mode })
  useEffect(() => {
    const onKey = (e) => {
      const k = kbRef.current
      const inInput = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOverlay((o) => (o === 'palette' ? null : 'palette'))
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        kbRef.current.openDaily?.()
        return
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setOverlay('capture')
        return
      }
      if (e.ctrlKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        setMode(['brain', 'dashboard', 'skills'][+e.key - 1])
        return
      }
      if (e.key === 'Escape' && !inInput) {
        if (k.overlay) setOverlay(null)
        else if (k.selected) {
          if (!k.dirty || window.confirm('Discard unsaved edits?')) setSelected(null)
        } else bus.emit('hover', null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeIds = graph ? new Set(graph.notes.filter((n) => matchFilter(n, filter)).map((n) => n.id)) : null
  const filtering = graph ? activeIds.size !== graph.notes.length : false
  const featured = graph ? graph.notes.find((n) => n.id === selected) || stats.hubs[0] : null

  // the ONE dirty-guarded selection choke point — every note-switch routes here
  const guardDirty = () => !kbRef.current.dirty || window.confirm('Discard unsaved edits?')
  const selectNote = (id) => {
    if (!guardDirty()) return
    setSelected(id)
  }

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
    if (!guardDirty()) return
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
  const openNote = (id) => {
    if (!guardDirty()) return
    setSelected(id)
    setFlyTo((f) => ({ id, nonce: (f?.nonce || 0) + 1 }))
    if (id && lastOpened.current !== id) {
      lastOpened.current = id
      window.onyx.bumpUsage?.('noteOpen').then(setUsage)
    }
  }
  const openDaily = async () => {
    const folder = cfg?.dailyFolder || '06 - Daily Logs'
    const now = new Date()
    const id = dailyId(now, folder)
    const res = await window.onyx.ensureNote?.(id, dailyTemplate(now))
    if (res?.created) setGraph(await window.onyx.getGraph())
    openNote(id)
    window.onyx.bumpUsage?.('dailyOpen').then(setUsage)
  }
  kbRef.current.openDaily = openDaily
  const handleCapture = async (text) => {
    const folder = cfg?.dailyFolder || '06 - Daily Logs'
    const now = new Date()
    const id = dailyId(now, folder)
    await window.onyx.ensureNote?.(id, dailyTemplate(now))
    // ensureNote guarantees the file exists — a null read is a READ ERROR
    // (OneDrive lock, AV scan). Never fall back to the template: that path
    // would overwrite the whole day. Abort and let the user retry.
    const raw = await window.onyx.readNote(id)
    if (raw == null) {
      bus.emit('toast', { msg: '✗ capture failed — daily note unreadable, try again', kind: 'err', ttl: 4000 })
      return false
    }
    const ok = await window.onyx.writeNote(id, appendCapture(raw, text, now))
    if (!ok) {
      bus.emit('toast', { msg: '✗ capture failed — vault not writable', kind: 'err', ttl: 4000 })
      return false
    }
    window.onyx.bumpUsage?.('captureSave').then(setUsage)
    bus.emit('toast', { msg: `◆ captured to ${id.split('/').pop()}`, kind: 'info', ttl: 2200 })
    return true
  }
  const togglePin = (id) => {
    if (!id) return
    const adding = !pins.includes(id)
    const next = adding ? [...pins, id] : pins.filter((p) => p !== id)
    setPins(next)
    window.onyx.setConfig({ pins: next })
    if (adding) window.onyx.bumpUsage?.('pinAdd').then(setUsage)
  }
  const handleRenamed = (oldId, newId) => {
    if (pins.includes(oldId)) {
      const next = pins.map((p) => (p === oldId ? newId : p))
      setPins(next)
      window.onyx.setConfig({ pins: next })
    }
    lastOpened.current = newId
  }

  const actions = [
    { label: 'New note', hint: 'create in active folder', run: handleCreate },
    { label: "Open today's daily note", hint: 'Ctrl+D', run: openDaily },
    { label: 'Quick capture', hint: 'Ctrl+Shift+N', run: () => setOverlay('capture') },
    ...(selected
      ? [{ label: `${pins.includes(selected) ? 'Unpin' : 'Pin'}: ${graph.notes.find((n) => n.id === selected)?.title || ''}`, hint: 'pins', run: () => togglePin(selected) }]
      : []),
    { label: 'View: Brain', hint: 'lens', run: () => { setMode('brain'); changeView('brain') } },
    { label: 'View: Solar System', hint: 'lens', run: () => { setMode('brain'); changeView('solar') } },
    { label: 'View: Core of Everything', hint: 'lens', run: () => { setMode('brain'); changeView('core') } },
    { label: 'View: Second Brain Globe', hint: 'lens', run: () => { setMode('brain'); changeView('globe') } },
    { label: 'View: Constellation', hint: 'lens', run: () => { setMode('brain'); changeView('constellation') } },
    { label: 'Mode: Dashboard', hint: 'Ctrl+2', run: () => setMode('dashboard') },
    { label: 'Mode: Skills', hint: 'Ctrl+3', run: () => setMode('skills') },
    { label: 'Toggle synapses', hint: 'links', run: toggleLinks },
    { label: 'Toggle labels', hint: 'labels', run: toggleLabels },
    ...(filtering ? [{ label: 'Clear filters', hint: 'reset', run: () => setFilter(EMPTY_FILTER) }] : []),
    { label: 'Reset camera', hint: 'view', run: () => setResetNonce((n) => n + 1) },
    { label: 'Change vault…', hint: 'system', run: () => window.onyx.pickVault().then(setGraph) }
  ]

  return (
    <div className="app hud">
      {graph && graph.notes.length > 0 && (
        <>
      <div className={`stage ${mode !== 'brain' ? 'dimmed' : ''}`}>
        <SpaceCanvas
          view={view}
          graph={graph}
          activeIds={filtering ? activeIds : null}
          onSelect={selectNote}
          onHover={(h) => bus.emit('hover', h)}
          showAllLinks={showAllLinks}
          showLabels={showLabels}
          resetNonce={resetNonce}
          paused={mode !== 'brain'}
          focus={flyTo}
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
              onSelect={openNote}
              onCreate={handleCreate}
              onOpenDaily={openDaily}
              pins={pins}
            />
            <div className="hud-spacer" />
            <Cockpit
              graph={graph}
              clusters={clusters}
              onSelect={openNote}
              onUsage={(n) => window.onyx.bumpUsage?.(n).then(setUsage)}
            />
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
        <DashboardMode
          graph={graph}
          clusters={clusters}
          usage={usage}
          onSelect={openNote}
          onFilter={(f) => {
            setFilter(f)
            setMode('brain')
          }}
        />
      )}
      {mode === 'skills' && evaluated && <SkillsMode evaluated={evaluated} />}
      {overlay === 'palette' && (
        <CommandPalette graph={graph} actions={actions} onSelectNote={openNote} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'capture' && (
        <QuickCapture
          targetLabel={dailyId(new Date(), cfg?.dailyFolder || '06 - Daily Logs')}
          onCapture={handleCapture}
          onClose={() => setOverlay(null)}
        />
      )}
      {selected && (
        <NoteReader
          id={selected}
          graph={graph}
          onSelect={openNote}
          onClose={() => selectNote(null)}
          pinned={pins.includes(selected)}
          onTogglePin={() => togglePin(selected)}
          onRenamed={handleRenamed}
          onUsage={(name) => window.onyx.bumpUsage?.(name).then(setUsage)}
          onEditingChange={(d) => {
            kbRef.current.dirty = d
          }}
        />
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
        </>
      )}
      {graph && !graph.notes.length && (
        <div className="empty">
          <h1>◑ Onyx</h1>
          <p>No notes found in this folder.</p>
          <button onClick={() => window.onyx.pickVault().then(setGraph)}>Choose vault folder</button>
        </div>
      )}
      {(booting || !graph) &&
        (!graph && bootTimedOut ? (
          <div className="boot">
            <div className="empty">
              <h1>◑ Onyx</h1>
              <p>Couldn't open the vault — pick a folder of .md files.</p>
              <button onClick={() => window.onyx.pickVault().then(setGraph)}>Choose vault folder</button>
            </div>
          </div>
        ) : (
          <BootSequence
            graph={graph}
            clusterCount={clusters.clusterCount}
            vaultPath={cfg?.vaultPath || ''}
            onDone={() => setBooting(false)}
          />
        ))}
    </div>
  )
}
