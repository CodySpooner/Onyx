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
import { findTemplateFolder, applyTemplate } from './lib/templates.mjs'
import { dueCards, grade, prune } from './lib/srs.mjs'
import { ReviewModal } from './components/ReviewModal.jsx'
import { pushTrail, pruneTrail, trailBack } from './lib/trail.mjs'
import { tickQuests, reroll as rerollQuest } from './lib/quests.mjs'
import { insertWikilink, triageQueue } from './lib/suggest.mjs'
import { toggleTask } from './lib/tasks.mjs'
import { TrailStrip } from './components/TrailStrip.jsx'
import { TriageModal } from './components/TriageModal.jsx'
import { scopeGraph } from './lib/workspaces.mjs'
import { shortestPath } from './lib/pathfind.mjs'
import { cleanFolder } from './lib/stats.mjs'
import { validateSettings, needsRebuild, DEFAULTS as GSET_DEFAULTS } from './lib/graph-settings.mjs'
import { CustomizeDrawer } from './components/CustomizeDrawer.jsx'
import { VaultPill, TopicPill } from './components/ScopeControls.jsx'
import { FindReplaceModal } from './components/FindReplaceModal.jsx'
import { NotesMode } from './modes/NotesMode.jsx'

const skey = (s) => (s.a < s.b ? s.a + '|' + s.b : s.b + '|' + s.a)

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
  const [focusMode, setFocusMode] = useState(false)
  const [pins, setPins] = useState([])
  const [flyTo, setFlyTo] = useState(null)
  const [srs, setSrs] = useState({})
  const [srsLoaded, setSrsLoaded] = useState(false)
  const srsStamped = useRef(false)
  const [reviewQueue, setReviewQueue] = useState([])
  const [trail, setTrail] = useState([])
  const trailLoaded = useRef(false)
  const resumeShown = useRef(false)
  const [dismissed, setDismissed] = useState(() => new Set())
  const [triageRows, setTriageRows] = useState([])
  const [pendingTasks, setPendingTasks] = useState(() => new Set())
  const [gset, setGset] = useState(null) // null until loaded — views fall back to defaults
  const [showCustomize, setShowCustomize] = useState(false)
  const gsetTimer = useRef(null)
  const gsetPendingWrite = useRef(null)
  const [topicFolder, setTopicFolder] = useState(null) // active folder scope | null = All Topics
  const [vaults, setVaults] = useState({ active: null, vaults: [] })
  const [pathMode, setPathMode] = useState(false) // click two notes → trace their link path
  const [pathAnchor, setPathAnchor] = useState(null) // first endpoint, awaiting the second
  const [pathIds, setPathIds] = useState(null) // resolved path node ids, highlighted in the lens
  const [quests, setQuests] = useState(null)
  const [questsLoaded, setQuestsLoaded] = useState(false)
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
    window.onyx.storeGet?.('srs').then((s) => {
      setSrs(s?.states || {}) // unpruned — liveness in the vault decides below
      setSrsLoaded(true)
    })
    window.onyx.storeGet?.('trail').then((t) => {
      if (Array.isArray(t?.entries)) setTrail(t.entries)
      trailLoaded.current = true
    })
    window.onyx.storeGet?.('suggest-dismissed').then((d) => {
      if (Array.isArray(d?.keys)) setDismissed(new Set(d.keys))
    })
    window.onyx.storeGet?.('graph-custom').then((s0) => {
      const v = validateSettings(s0)
      setGset(v)
      // the first view builds before this resolves — if the stored settings
      // include build-time keys (theme, gem shape...), rebuild it once
      if (needsRebuild(GSET_DEFAULTS, v, 'brain')) setResetNonce((n) => n + 1)
    })
    window.onyx.listVaults?.().then(setVaults)
    window.onyx.storeGet?.('quests').then((qs) => {
      setQuests(qs || null)
      setQuestsLoaded(true) // state, not ref: the boot tick must re-run when this lands
    })
  }, [])

  // quests tick at boot and on every usage change: rollover, latch, award XP
  useEffect(() => {
    if (!questsLoaded || !usage) return
    setQuests((prev) => {
      const { state, completed, changed } = tickQuests(prev, usage, Date.now())
      if (completed.length) {
        for (const q of completed) bus.emit('toast', { msg: `◆ quest complete: ${q.label} · +${q.xp} XP`, kind: 'skill' })
      }
      if (changed) window.onyx.storeSet?.('quests', state)
      return changed ? state : prev
    })
  }, [usage, questsLoaded])

  const rerollDaily = (questId) => {
    setQuests((prev) => {
      const { state, changed } = rerollQuest(prev, usage, questId, Date.now())
      if (changed) window.onyx.storeSet?.('quests', state)
      return changed ? state : prev
    })
  }

  // trail persistence + pruning against live notes
  useEffect(() => {
    if (trailLoaded.current) window.onyx.storeSet?.('trail', { entries: trail })
  }, [trail])
  useEffect(() => {
    if (!graph) return
    const live = new Set(graph.notes.map((n) => n.id))
    setTrail((t) => {
      const next = pruneTrail(t, live)
      return next.length === t.length ? t : next
    })
    setPendingTasks(new Set()) // reindex arrived — optimistic task marks resolve
  }, [graph])

  // one-shot "resume last session" toast — filter dead entries BEFORE latching,
  // so a note deleted between sessions can't permanently suppress the toast
  useEffect(() => {
    if (!graph || !trailLoaded.current || resumeShown.current || !trail.length || selected) return
    const live = new Set(graph.notes.map((n) => n.id))
    const liveTrail = trail.filter((e) => live.has(e.id))
    if (!liveTrail.length) return
    resumeShown.current = true
    const last = liveTrail[liveTrail.length - 1]
    bus.emit('toast', {
      msg: `◆ last session: ${liveTrail.length} notes`,
      action: { label: 'RESUME', run: () => kbRef.current.openNote?.(last.id) }
    })
  }, [graph, trail])

  // once per session, after BOTH store and graph arrive: stamp lastSeen for
  // cards still in the vault, THEN prune — so a 60d+ gap between launches
  // never wipes a live card's schedule
  useEffect(() => {
    if (srsStamped.current || !srsLoaded || !graph?.cards?.length) return
    srsStamped.current = true
    setSrs((prev) => {
      const now = Date.now()
      const live = new Set(graph.cards.map((c) => c.hash))
      const stamped = {}
      for (const [hash, st] of Object.entries(prev)) {
        stamped[hash] = live.has(hash) ? { ...st, lastSeen: now } : st
      }
      const next = prune(stamped, now)
      window.onyx.storeSet?.('srs', { states: next })
      return next
    })
  }, [graph, srsLoaded])

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
      hover: (id) => bus.emit('hover', { id, x: 620, y: 320, pinned: true }),
      setTopic: (id) => setTopicFolder(id),
      setPathIds: (ids) => setPathIds(ids)
    }
  }, [])

  // ── topic scope: focusing one folder is a VIEW over the vault, never a move ──
  // a topic = { folders: [id] }; scopeGraph gives the same clean-slate subgraph
  // every mode already consumes. Not persisted — boots to All Topics always.
  const activeTopic = useMemo(() => {
    if (!graph || !topicFolder) return null
    const f = graph.folders.find((x) => x.id === topicFolder)
    return f ? { id: 'topic:' + f.id, name: cleanFolder(f.name), color: f.color, folders: [f.id], tags: [], noteIds: [] } : null
  }, [graph, topicFolder])
  const scoped = useMemo(() => (graph && activeTopic ? scopeGraph(graph, activeTopic) : graph), [graph, activeTopic])

  // topic folder vanished after a reindex/vault switch → fall back to All
  useEffect(() => {
    if (graph && topicFolder && !graph.folders.some((f) => f.id === topicFolder)) setTopicFolder(null)
  }, [graph, topicFolder])
  // focusing a folder is LOUD + clears stale filters (a folder chip from the
  // whole-vault view rarely matches inside a single topic)
  useEffect(() => {
    setFilter(EMPTY_FILTER)
    if (topicFolder && graph && activeTopic) {
      bus.emit('toast', { msg: `◍ ${activeTopic.name} — ${scoped.notes.length} notes · pill → All Topics` })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicFolder])

  // path-finding is a brain-lens interaction; drop it when the lens/mode/graph
  // changes so a stale path can't linger over rebuilt or unrelated nodes
  useEffect(() => {
    setPathMode(false)
    setPathAnchor(null)
    setPathIds(null)
  }, [view, mode, graph])

  const switchVault = (path) => {
    window.onyx.switchVault?.(path).then((g) => {
      setGraph(g)
      setTopicFolder(null)
      setSelected(null)
      window.onyx.listVaults?.().then(setVaults)
    })
  }
  const openVault = () => {
    window.onyx.pickVault().then((g) => {
      setGraph(g)
      setTopicFolder(null)
      setSelected(null)
      window.onyx.getConfig().then(setCfg)
      window.onyx.listVaults?.().then(setVaults)
    })
  }
  const updateGset = (patch) => {
    setGset((prev) => {
      const next = validateSettings({ ...(prev || GSET_DEFAULTS), ...patch })
      if (needsRebuild(prev, next, view)) setResetNonce((n) => n + 1)
      clearTimeout(gsetTimer.current)
      gsetPendingWrite.current = next
      gsetTimer.current = setTimeout(() => {
        gsetPendingWrite.current = null
        window.onyx.storeSet?.('graph-custom', next)
      }, 400)
      return next
    })
  }
  // flush a pending debounced settings write if the window closes inside 400ms
  useEffect(() => {
    const flush = () => {
      if (gsetPendingWrite.current) window.onyx.storeSet?.('graph-custom', gsetPendingWrite.current)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  // hoisted graph-derived data (computed once per graph)
  const stats = useMemo(() => (scoped ? vaultStats(scoped) : null), [scoped])
  const clusters = useMemo(
    () => (scoped ? detectClusters(scoped.notes.map((n) => n.id), scoped.links) : { clusterCount: 0, clusterOf: new Map() }),
    [scoped]
  )
  // full-graph consumers (NoteReader minimap, TrailStrip) need cluster colors
  // for out-of-scope notes too — scoped clusters would miss them
  const fullClusters = useMemo(() => {
    if (!graph) return { clusterCount: 0, clusterOf: new Map() }
    if (scoped === graph) return clusters
    return detectClusters(graph.notes.map((n) => n.id), graph.links)
  }, [graph, scoped, clusters])
  // expensive graph-only half memoized on [graph]; cheap usage merge per bump
  const graphSkillStats = useMemo(() => (graph ? buildGraphSkillStats(graph, Date.now()) : null), [graph])
  const evaluated = useMemo(
    () => (graphSkillStats ? evaluateSkills({ ...mergeUsageStats(graphSkillStats, usage, Date.now()), questBonusXp: quests?.bonusXp || 0 }) : null),
    [graphSkillStats, usage, quests]
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
  Object.assign(kbRef.current, { overlay, selected, mode, focusMode, trail })
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
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        setOverlay('findreplace')
        return
      }
      if (e.ctrlKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        kbRef.current.changeMode?.(['brain', 'notes', 'dashboard', 'skills'][+e.key - 1])
        return
      }
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey && !inInput && k.selected && k.mode === 'brain') {
        e.preventDefault()
        setFocusMode((f) => !f)
        return
      }
      if (e.altKey && e.key === 'ArrowLeft' && !inInput) {
        e.preventDefault()
        kbRef.current.goBack?.()
        return
      }
      if (e.key === 'Escape' && !inInput) {
        if (k.overlay) setOverlay(null)
        else if (k.focusMode) setFocusMode(false)
        else if (k.selected) {
          if (!k.dirty || window.confirm('Discard unsaved edits?')) setSelected(null)
        } else bus.emit('hover', null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeIds = scoped ? new Set(scoped.notes.filter((n) => matchFilter(n, filter)).map((n) => n.id)) : null
  const filtering = scoped ? activeIds.size !== scoped.notes.length : false
  const featured = scoped ? scoped.notes.find((n) => n.id === selected) || stats.hubs[0] : null

  // the ONE dirty-guarded selection choke point — every note-switch routes here
  const guardDirty = () => !kbRef.current.dirty || window.confirm('Discard unsaved edits?')
  const selectNote = (id) => {
    if (!guardDirty()) return
    if (id == null) setFocusMode(false) // closing the reader always exits focus
    setSelected(id)
    if (id) setTrail((t) => pushTrail(t, id, Date.now()))
  }

  // path-finding: in path mode a node click picks the two endpoints instead of
  // opening; the shortest chain then lights up in the graph
  const onNodeSelect = (id) => {
    if (!pathMode || id == null) return selectNote(id)
    if (!pathAnchor) {
      setPathAnchor(id)
      setPathIds(null)
      bus.emit('toast', { msg: '⤳ path: now click the destination note' })
      return
    }
    const r = shortestPath(scoped.links, pathAnchor, id)
    if (r && r.ids.length > 1) {
      setPathIds(r.ids)
      bus.emit('toast', { msg: `⤳ path found — ${r.ids.length} notes, ${r.edges.length} hops` })
    } else {
      setPathIds(null)
      bus.emit('toast', { msg: '⤳ no link path between those two notes', kind: 'err' })
    }
    setPathAnchor(null)
  }
  const togglePathMode = () => {
    setPathMode((on) => {
      const next = !on
      setPathAnchor(null)
      setPathIds(null)
      bus.emit('toast', { msg: next ? '⤳ path mode — click the starting note' : '⤳ path mode off' })
      return next
    })
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
  const handleCreate = async (intoFolder = null) => {
    if (!guardDirty()) return
    const folder = intoFolder || filter.folders[0] || '(root)'
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
    if (id) setTrail((t) => pushTrail(t, id, Date.now()))
    if (id && lastOpened.current !== id) {
      lastOpened.current = id
      window.onyx.bumpUsage?.('noteOpen').then(setUsage)
    }
  }
  kbRef.current.openNote = openNote
  // ONE dirty-guarded mode switch: the reader REMOUNTS when it moves between
  // the notes-mode dock and the overlay slot — an unguarded switch eats drafts
  const changeMode = (m) => {
    if (m === kbRef.current.mode) return
    if (!guardDirty()) return
    kbRef.current.dirty = false
    setFocusMode(false) // stale focus over a non-brain mode blanks the screen
    setMode(m)
  }
  kbRef.current.changeMode = changeMode
  const flyToBrain = (id) => {
    if (!guardDirty()) return
    kbRef.current.dirty = false
    setMode('brain')
    openNote(id)
  }
  // Alt+Left: a real back-stack. Pop the tail FIRST, then select without a
  // fresh push — routing through openNote/pushTrail would move-to-end the
  // target and ping-pong between the last two notes forever.
  const goBack = () => {
    const back = trailBack(kbRef.current.trail)
    if (!back) return
    if (!guardDirty()) return
    kbRef.current.dirty = false // discard just confirmed — don't re-ask downstream
    setTrail((t) => t.slice(0, -1))
    setSelected(back)
    setFlyTo((f) => ({ id: back, nonce: (f?.nonce || 0) + 1 }))
  }
  kbRef.current.goBack = goBack
  const openDaily = async (date = null) => {
    if (!guardDirty()) return // guard BEFORE the vault write and the counter bump
    kbRef.current.dirty = false
    const folder = cfg?.dailyFolder || '06 - Daily Logs'
    const now = date instanceof Date ? date : new Date() // guards click-event args
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
  const createFromTemplate = async (templateId, intoFolder = null) => {
    if (!guardDirty()) return
    const raw = await window.onyx.readNote(templateId)
    if (raw == null) {
      bus.emit('toast', { msg: '✗ template unreadable', kind: 'err', ttl: 3000 })
      return
    }
    const folder = intoFolder || filter.folders[0] || '(root)'
    const id = await window.onyx.createNote(folder, 'Untitled')
    if (!id) return
    const ok = await window.onyx.writeNote(id, applyTemplate(raw, { title: 'Untitled', now: new Date() }))
    if (!ok) bus.emit('toast', { msg: '✗ could not write the new note', kind: 'err', ttl: 3000 })
    setGraph(await window.onyx.getGraph())
    setSelected(id)
    window.onyx.bumpUsage?.('noteCreate').then(setUsage)
  }
  const templateFolder = graph ? findTemplateFolder(graph.folders) : null
  const templates = templateFolder ? graph.notes.filter((n) => n.folder === templateFolder) : []

  // Synapse Suggestions: engine runs in the indexer; renderer filters dismissals
  const suggestions = useMemo(
    () => (scoped?.suggestions || []).filter((s) => !dismissed.has(skey(s))),
    [scoped, dismissed]
  )
  const titleOf = (id) => graph?.notes.find((n) => n.id === id)?.title || id
  const dismissSuggestion = (s) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(skey(s))
      window.onyx.storeSet?.('suggest-dismissed', { keys: [...next] })
      return next
    })
  }
  const acceptSuggestion = async (s) => {
    const src = s.mention?.in || s.a
    const dst = src === s.a ? s.b : s.a
    // read-modify-write with the capture-abort pattern: a null read is a lock,
    // never a license to guess
    const raw = await window.onyx.readNote(src)
    if (raw == null) {
      bus.emit('toast', { msg: '✕ could not read note — link aborted', kind: 'err' })
      return false
    }
    // wikilinks resolve by FILENAME (here and in Obsidian) — link the basename,
    // carry the pretty title as an alias when they differ
    const base = dst.split('/').pop().replace(/\.md$/i, '')
    const next = insertWikilink(raw, base, s.mention, titleOf(dst))
    if (next === raw) {
      dismissSuggestion(s) // already linked by hand — retire the suggestion
      return 'already'
    }
    const ok = await window.onyx.writeNote(src, next)
    if (!ok) {
      bus.emit('toast', { msg: '✕ could not write note', kind: 'err' })
      return false
    }
    dismissSuggestion(s)
    window.onyx.bumpUsage?.('linkAccept').then(setUsage)
    bus.emit('toast', {
      msg: `◆ linked ${titleOf(src)} → ${titleOf(dst)}`,
      kind: 'skill',
      action: {
        label: 'UNDO',
        run: async () => {
          // compare-and-swap: restore ONLY if the file still holds exactly
          // what accept wrote — never clobber a newer edit with a stale copy
          const cur = await window.onyx.readNote(src)
          if (cur !== next) {
            bus.emit('toast', { msg: '✕ note changed since link — undo skipped', kind: 'err' })
            return
          }
          const undone = await window.onyx.writeNote(src, raw)
          bus.emit('toast', undone ? { msg: '↩ link undone' } : { msg: '✕ undo failed — vault not writable', kind: 'err' })
        }
      }
    })
    return true
  }

  // eco lens: clicking a building filters the brain like a FolderTabs click
  useEffect(() => bus.on('eco:filter', (folderId) => setFilter({ ...EMPTY_FILTER, folders: [folderId] })), [])

  const due = graph?.cards ? dueCards(graph.cards, srs, Date.now()) : []
  // freeze the deck at open time — live `due` shrinks with every grade,
  // which would skip cards / strand the modal if passed directly
  const openReview = () => {
    setReviewQueue(due)
    setOverlay('review')
  }
  // orphan triage: same frozen-queue discipline
  const openTriage = () => {
    setTriageRows(triageQueue(scoped.notes, suggestions, dismissed))
    setOverlay('triage')
  }
  const acceptFromTriage = async (s) => {
    const ok = await acceptSuggestion(s)
    if (ok === true) window.onyx.bumpUsage?.('orphanLinked').then(setUsage)
    return ok // 'already' still advances the queue; false keeps the orphan up
  }

  // content-guarded task toggle (CORTEX §10): re-read at click, exact-line
  // match or single relocation, refuse-on-ambiguity — never guess in a vault.
  // All toggles run through ONE promise chain: two clicks in the same note
  // must not both read the pre-write content (write-from-stale-state race).
  const taskChain = useRef(Promise.resolve())
  const unpend = (key) =>
    setPendingTasks((p) => {
      const n = new Set(p)
      n.delete(key)
      return n
    })
  const doToggle = async (t, key) => {
    const raw = await window.onyx.readNote(t.noteId)
    if (raw == null) {
      unpend(key)
      bus.emit('toast', { msg: '✕ could not read note — toggle aborted', kind: 'err' })
      return
    }
    const res = toggleTask(raw, t.line, t.raw)
    if (!res) {
      unpend(key)
      bus.emit('toast', { msg: '✕ task moved — note changed on disk, try again', kind: 'err' })
      return
    }
    const ok = await window.onyx.writeNote(t.noteId, res.next)
    if (!ok) {
      unpend(key)
      bus.emit('toast', { msg: '✕ could not write note', kind: 'err' })
      return
    }
    if (res.nowDone) window.onyx.bumpUsage?.('taskComplete').then(setUsage)
    // pending key resolves when the writeNote-triggered reindex lands
  }
  const toggleTaskAt = (t) => {
    const key = `${t.noteId}:${t.line}`
    if (pendingTasks.has(key)) return
    setPendingTasks((p) => new Set(p).add(key)) // sync — double-clicks go inert
    taskChain.current = taskChain.current.then(() => doToggle(t, key)).catch(() => {})
  }
  const handleGrade = (card, g) => {
    const next = { ...srs, [card.hash]: grade(srs[card.hash], g, Date.now()) }
    setSrs(next)
    window.onyx.storeSet?.('srs', { states: next })
    window.onyx.bumpUsage?.('reviewsDone').then(setUsage)
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
    ...templates.map((t) => ({
      label: `New from template: ${t.title}`,
      hint: 'template',
      run: () => createFromTemplate(t.id)
    })),
    { label: 'Quick capture', hint: 'Ctrl+Shift+N', run: () => setOverlay('capture') },
    ...(due.length ? [{ label: `Review due cards (${due.length})`, hint: 'srs', run: openReview }] : []),
    ...(stats?.orphans ? [{ label: `Triage orphans (${stats.orphans})`, hint: 'inbox', run: openTriage }] : []),
    { label: 'Find & replace in vault', hint: 'Ctrl+Shift+H', run: () => setOverlay('findreplace') },
    {
      label: 'Check for updates now',
      hint: 'updater',
      run: async () => {
        bus.emit('toast', { msg: '◌ checking for updates…', ttl: 2000 })
        const r = await window.onyx.checkUpdates?.()
        const msg =
          r?.status === 'latest' ? `✓ you're on the latest (v${r.current})`
          : r?.status === 'found' ? `◆ v${r.version} found — downloading now`
          : r?.status === 'dev' ? 'dev build — the updater runs in the installed app only'
          : `✕ update check failed — ${r?.message || 'unknown'}`
        bus.emit('toast', { msg, kind: r?.status === 'error' ? 'err' : r?.status === 'found' ? 'skill' : 'info', ttl: 6000 })
      }
    },
    ...(selected
      ? [{ label: `${pins.includes(selected) ? 'Unpin' : 'Pin'}: ${graph.notes.find((n) => n.id === selected)?.title || ''}`, hint: 'pins', run: () => togglePin(selected) }]
      : []),
    { label: 'View: Brain', hint: 'lens', run: () => { changeMode('brain'); changeView('brain') } },
    { label: 'View: Nexus Core', hint: 'lens', run: () => { changeMode('brain'); changeView('nexus') } },
    { label: 'View: Atlas', hint: 'lens', run: () => { changeMode('brain'); changeView('atlas') } },
    { label: 'View: Stacks', hint: 'lens', run: () => { changeMode('brain'); changeView('stacks') } },
    { label: 'View: Transit Map', hint: 'lens', run: () => { changeMode('brain'); changeView('transit') } },
    { label: 'View: Corkboard', hint: 'lens', run: () => { changeMode('brain'); changeView('corkboard') } },
    { label: 'View: Mycelium', hint: 'lens', run: () => { changeMode('brain'); changeView('mycelium') } },
    { label: 'View: Topography', hint: 'lens', run: () => { changeMode('brain'); changeView('topography') } },
    { label: 'View: Solar System', hint: 'lens', run: () => { changeMode('brain'); changeView('solar') } },
    { label: 'View: Core of Everything', hint: 'lens', run: () => { changeMode('brain'); changeView('core') } },
    { label: 'View: Second Brain Globe', hint: 'lens', run: () => { changeMode('brain'); changeView('globe') } },
    ...(topicFolder ? [{ label: 'Topic: All Topics', hint: 'scope', run: () => setTopicFolder(null) }] : []),
    ...(graph?.folders || []).filter((f) => f.id !== topicFolder).slice(0, 10).map((f) => ({ label: 'Topic: ' + cleanFolder(f.name), hint: 'scope', run: () => setTopicFolder(f.id) })),
    ...vaults.vaults.filter((v) => v.path !== vaults.active).slice(0, 6).map((v) => ({ label: 'Vault: ' + v.name, hint: 'switch', run: () => switchVault(v.path) })),
    { label: 'Mode: Notes', hint: 'Ctrl+2', run: () => changeMode('notes') },
    { label: 'Mode: Dashboard', hint: 'Ctrl+3', run: () => changeMode('dashboard') },
    { label: 'Mode: Skills', hint: 'Ctrl+4', run: () => changeMode('skills') },
    ...(selected && mode === 'brain' ? [{ label: 'Toggle focus mode', hint: 'F', run: () => setFocusMode((f) => !f) }] : []),
    {
      label: 'Resurface a thought',
      hint: 'serendipity',
      run: async () => {
        const { resurfacePick } = await import('./lib/resurface.mjs')
        const { dayKey } = await import('./lib/stats.mjs')
        const now = Date.now()
        const p = resurfacePick(graph.notes, dayKey(now), now)
        if (p) openNote(p.note.id)
      }
    },
    { label: 'Toggle synapses', hint: 'links', run: toggleLinks },
    { label: 'Toggle labels', hint: 'labels', run: toggleLabels },
    ...(filtering ? [{ label: 'Clear filters', hint: 'reset', run: () => setFilter(EMPTY_FILTER) }] : []),
    { label: 'Reset camera', hint: 'view', run: () => setResetNonce((n) => n + 1) },
    { label: 'Open vault folder…', hint: 'system', run: openVault }
  ]

  return (
    <div className={`app hud${focusMode && selected ? ' focus' : ''}`}>
      {graph && graph.notes.length > 0 && (
        <>
      <div className={`stage ${mode !== 'brain' ? 'dimmed' : ''}`}>
        <SpaceCanvas
          view={view}
          graph={scoped}
          activeIds={filtering ? activeIds : null}
          onSelect={onNodeSelect}
          onHover={(h) => bus.emit('hover', h)}
          showAllLinks={showAllLinks}
          showLabels={showLabels}
          resetNonce={resetNonce}
          paused={mode !== 'brain'}
          focus={flyTo}
          settings={gset}
          dueCount={due.length}
          pathIds={pathIds}
        />
      </div>
      <TopBar
        mode={mode}
        onMode={changeMode}
        workspacePill={
          <>
            <VaultPill vaults={vaults.vaults} active={vaults.active} onSwitch={switchVault} onOpen={openVault} />
            <TopicPill graph={graph} activeId={topicFolder} onPick={setTopicFolder} />
          </>
        }
        view={view}
        onView={changeView}
        onSearch={() => setOverlay('palette')}
        skillTab={evaluated ? { level: evaluated.level, levelPct: evaluated.levelPct, title: evaluated.title } : null}
      />
      {mode === 'brain' && (
        <>
          <FolderTabs graph={scoped} filter={filter} onChange={setFilter} />
          <div className="hud-body">
            <HudSidebar
              graph={scoped}
              stats={stats}
              filter={filter}
              onFilter={setFilter}
              featured={featured}
              onSelect={openNote}
              onCreate={handleCreate}
              onOpenDaily={openDaily}
              pins={pins}
              dueCount={due.length}
              onReview={openReview}
              selected={selected}
              matchCount={activeIds ? activeIds.size : 0}
              onToggleTask={toggleTaskAt}
              pendingTasks={pendingTasks}
            />
            <div className="hud-spacer" />
            <Cockpit
              graph={scoped}
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
              onTune={() => setShowCustomize((v) => !v)}
              tuneOn={showCustomize}
              onPath={togglePathMode}
              pathOn={pathMode}
            />
            {showCustomize && gset && (
              // gated on gset: interacting before the store loads would
              // persist DEFAULTS over the user's saved settings
              <CustomizeDrawer gset={gset} view={view} onChange={updateGset} onClose={() => setShowCustomize(false)} />
            )}
          </div>
          <HoverLayer graph={scoped} />
        </>
      )}
      {mode === 'notes' && (
        <NotesMode
          graph={scoped}
          selected={selected}
          pins={pins}
          dailyFolder={cfg?.dailyFolder || '06 - Daily Logs'}
          templates={templates}
          onOpen={openNote}
          onClose={() => selectNote(null)}
          onCreate={handleCreate}
          onCreateFromTemplate={createFromTemplate}
          onTogglePin={togglePin}
          onFlyTo={flyToBrain}
          readerProps={{
            graph,
            clusters: fullClusters,
            suggestions,
            onAcceptSuggestion: acceptSuggestion,
            onDismissSuggestion: dismissSuggestion,
            onSelect: openNote,
            onRenamed: handleRenamed,
            onUsage: (name) => window.onyx.bumpUsage?.(name).then(setUsage),
            onEditingChange: (d) => {
              kbRef.current.dirty = d
            }
          }}
        />
      )}
      {mode === 'dashboard' && (
        <DashboardMode
          graph={scoped}
          fullGraph={graph}
          clusters={clusters}
          usage={usage}
          onSelect={openNote}
          onFilter={(f) => {
            setFilter(f)
            changeMode('brain')
          }}
          suggestions={suggestions}
          onAcceptSuggestion={acceptSuggestion}
          onDismissSuggestion={dismissSuggestion}
          onTriage={openTriage}
          onToggleTask={toggleTaskAt}
          pendingTasks={pendingTasks}
          dueCount={due.length}
          onReview={openReview}
          onOpenDaily={openDaily}
          onCapture={handleCapture}
          dailyFolder={cfg?.dailyFolder || '06 - Daily Logs'}
        />
      )}
      {mode === 'skills' && evaluated && (
        <SkillsMode evaluated={evaluated} quests={quests} usage={usage} onReroll={rerollDaily} notes={graph?.notes || []} />
      )}
      {overlay === 'palette' && (
        <CommandPalette graph={scoped} actions={actions} onSelectNote={openNote} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'capture' && (
        <QuickCapture
          targetLabel={dailyId(new Date(), cfg?.dailyFolder || '06 - Daily Logs')}
          onCapture={handleCapture}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'review' && reviewQueue.length > 0 && (
        <ReviewModal due={reviewQueue} onGrade={handleGrade} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'findreplace' && graph && (
        // full graph on purpose — the modal promises WHOLE VAULT; a scoped
        // scan would silently skip out-of-workspace notes mid-rename
        <FindReplaceModal graph={graph} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'triage' && triageRows.length > 0 && (
        <TriageModal
          queue={triageRows}
          graph={graph}
          onAccept={acceptFromTriage}
          onOpen={(id) => {
            setOverlay(null)
            openNote(id)
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {selected && mode !== 'notes' && (
        <NoteReader
          id={selected}
          onFullscreen={() => setFocusMode((f) => !f)}
          graph={graph}
          clusters={fullClusters}
          suggestions={suggestions}
          onAcceptSuggestion={acceptSuggestion}
          onDismissSuggestion={dismissSuggestion}
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
      {mode === 'brain' && !focusMode && trail.length > 1 && (
        <TrailStrip
          trail={trail}
          graph={graph}
          clusters={fullClusters}
          current={selected}
          onOpen={openNote}
          onClear={() => setTrail([])}
        />
      )}
      <StatusBar
        graph={scoped}
        clusterCount={clusters.clusterCount}
        vaultPath={cfg?.vaultPath || ''}
        onPickVault={openVault}
        onPomodoroDone={() => window.onyx.bumpUsage?.('pomodorosCompleted').then(setUsage)}
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
          <button onClick={openVault}>Choose vault folder</button>
        </div>
      )}
      {(booting || !graph) &&
        (!graph && bootTimedOut ? (
          <div className="boot">
            <div className="empty">
              <h1>◑ Onyx</h1>
              <p>Couldn't open the vault — pick a folder of .md files.</p>
              <button onClick={openVault}>Choose vault folder</button>
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
