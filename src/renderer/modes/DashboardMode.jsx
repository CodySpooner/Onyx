import { useEffect, useMemo, useRef, useState } from 'react'
import { Gauge } from '../components/Gauge.jsx'
import { Heatmap } from '../components/Heatmap.jsx'
import { TasksPanel } from '../components/TasksPanel.jsx'
import { ResurfacePanel } from '../components/ResurfacePanel.jsx'
import { ReadingList } from '../components/ReadingList.jsx'
import { HabitGrid } from '../components/HabitGrid.jsx'
import { Num } from '../components/chrome.jsx'
import { maturity, coldNotes, cleanFolder } from '../lib/stats.mjs'
import { CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { streaksFromDays } from '../lib/skills.mjs'
import { dailyId } from '../lib/daily.mjs'
import { monthGrid, markDays } from '../lib/calendar.mjs'
import {
  activityGrid, growthSeries, deltas, wordStats,
  clusterBreakdown, topTags, recentNotes, relAge, linkHealth
} from '../lib/dashboard.mjs'
import { folderWordTrend, linkMatrix, tagMomentum, duplicateTitles } from '../lib/insights.mjs'

const PAGES = ['overview', 'today', 'analytics', 'health']

function DeltaChip({ v, label }) {
  if (v == null) return <span className="dchip collecting">{label} —</span>
  const up = v >= 0
  return (
    <span className={`dchip ${up ? 'up' : 'down'}`}>
      {label} {up ? '+' : ''}{v}
    </span>
  )
}

function LineChart({ series }) {
  if (!series.length) return null
  const max = Math.max(1, ...series)
  const min = Math.min(...series)
  const span = Math.max(1, max - min)
  const pts = series.map((v, i) => `${(i / Math.max(1, series.length - 1)) * 100},${38 - ((v - min) / span) * 34}`)
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="linechart">
      {[10, 20, 30].map((y) => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} className="lc-grid" />
      ))}
      <polygon points={`0,40 ${pts.join(' ')} 100,40`} className="lc-area" />
      <polyline points={pts.join(' ')} className="lc-line" />
      <circle cx="100" cy={pts[pts.length - 1].split(',')[1]} r="1.6" className="lc-dot" />
    </svg>
  )
}

// several series, one viewbox — folder colors carry the identity
function MultiLine({ seriesList }) {
  const all = seriesList.flatMap((s) => s.series)
  if (!all.length) return null
  const max = Math.max(1, ...all)
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="linechart">
      {[10, 20, 30].map((y) => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} className="lc-grid" />
      ))}
      {seriesList.map((s) => (
        <polyline
          key={s.folder}
          points={s.series.map((v, i) => `${(i / Math.max(1, s.series.length - 1)) * 100},${38 - (v / max) * 34}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth="1.1"
          strokeOpacity="0.85"
        />
      ))}
    </svg>
  )
}

function BarRow({ color, label, value, max, onClick }) {
  return (
    <button className="barrow" onClick={onClick}>
      <i className="barrow-swatch" style={{ background: color }} />
      <span className="barrow-label">{label}</span>
      <span className="barrow-track">
        <i style={{ width: `${Math.round((value / Math.max(1, max)) * 100)}%`, background: color }} />
      </span>
      <span className="barrow-val num">{value}</span>
    </button>
  )
}

// shared by OVERVIEW and TODAY
function StreakPanel({ d, usage, i }) {
  return (
    <section className="dpanel brk panel-in span3" style={{ '--i': i }}>
      <div className="u-label">STREAK</div>
      <div className="rule-ticks" />
      <div className="dnum xl glowy">{d.streak.current}<span className="dnum-unit">d</span></div>
      <div className="dp-sub">BEST {d.streak.best}d · {d.streak.activeDays} active days</div>
      {!d.streak.activeToday && d.streak.current > 0 && (
        <div className="dp-warn">capture today to keep it</div>
      )}
      <div className="streak-strip">
        {Array.from({ length: 30 }, (_, i2) => {
          const t = new Date(d.now)
          t.setDate(t.getDate() - (29 - i2))
          const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
          return <i key={k} className={(usage?.days?.[k] || 0) > 0 ? 'on' : ''} />
        })}
      </div>
    </section>
  )
}

function DashCalendar({ graph, dailyFolder, onOpenDay, i }) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const noteIds = useMemo(() => new Set(graph.notes.map((n) => n.id)), [graph])
  const grid = useMemo(() => {
    const g = monthGrid(ym.y, ym.m)
    return { label: g.label, weeks: markDays(g.weeks, noteIds, dailyFolder) }
  }, [ym, noteIds, dailyFolder])
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const step = (dm) => setYm(({ y, m }) => {
    const d = new Date(y, m + dm, 1, 12)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  return (
    <section className="dpanel brk panel-in span4" style={{ '--i': i }}>
      <div className="cal-head">
        <button className="cal-nav" onClick={() => step(-1)}>‹</button>
        <span className="u-label">{grid.label}</span>
        <button className="cal-nav" onClick={() => step(1)}>›</button>
      </div>
      <div className="rule-ticks" />
      <div className="cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, k) => (
          <span key={k} className="cal-dow u-label">{d}</span>
        ))}
        {grid.weeks.flat().map((c) => {
          const future = c.dateStr > todayStr
          return (
            <button
              key={c.dateStr}
              className={`cal-cell${c.inMonth ? '' : ' dim'}${c.dateStr === todayStr ? ' today' : ''}${c.has ? ' has' : ''}`}
              disabled={future}
              data-tip={c.has ? c.dateStr : future ? undefined : c.dateStr + ' · create daily note'}
              onClick={() => onOpenDay(new Date(c.y, c.m, c.d, 12))}
            >
              {c.d}
              {c.has && <i />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function DashboardMode({
  graph, clusters, usage, onSelect, onFilter,
  suggestions = [], onAcceptSuggestion, onDismissSuggestion,
  onTriage, onToggleTask, pendingTasks,
  dueCount = 0, onReview, onOpenDaily, onCapture, dailyFolder = '06 - Daily Logs'
}) {
  const [page, setPage] = useState('overview')
  const pageLoaded = useRef(false)
  useEffect(() => {
    window.onyx.storeGet?.('dash-ui').then((d) => {
      if (d?.page && PAGES.includes(d.page)) setPage(d.page)
      pageLoaded.current = true
    })
  }, [])
  const go = (p) => {
    setPage(p)
    if (pageLoaded.current) window.onyx.storeSet?.('dash-ui', { page: p })
  }
  // [ / ] cycle pages (single-key idiom, inert while typing)
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target.closest?.('input,textarea,select,[contenteditable]')) return
      if (e.key !== '[' && e.key !== ']') return
      const at = PAGES.indexOf(page)
      go(PAGES[(at + (e.key === ']' ? 1 : PAGES.length - 1)) % PAGES.length])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page])

  const [snaps, setSnaps] = useState([])
  useEffect(() => {
    window.onyx.getSnapshots?.().then((d) => setSnaps(d || []))
  }, [graph])

  // TODAY page: live daily-note preview + inline capture
  const todayId = dailyId(new Date(), dailyFolder)
  const [dailyRaw, setDailyRaw] = useState(null)
  const [capText, setCapText] = useState('')
  useEffect(() => {
    if (page !== 'today') return
    let dead = false
    window.onyx.readNote(todayId).then((r) => {
      if (!dead) setDailyRaw(r)
    })
    return () => {
      dead = true
    }
  }, [page, graph, todayId])
  const capture = async () => {
    const text = capText.trim()
    if (!text) return
    const ok = await onCapture(text)
    if (ok) setCapText('')
  }

  const d = useMemo(() => {
    const now = Date.now()
    const mat = maturity(graph.notes, now)
    const grid = activityGrid(graph.notes, now)
    const words = wordStats(graph.notes)
    const growth = growthSeries(snaps, graph.notes, now)
    const del = deltas(snaps, { notes: graph.notes.length, links: graph.meta.linkCount, words: words.total }, now)
    const breakdown = clusterBreakdown(graph.notes, clusters)
    const tags = topTags(graph.notes)
    const recent = recentNotes(graph.notes)
    const cold = coldNotes(graph.notes, now)
    const health = linkHealth(graph, clusters.clusterOf)
    const streak = streaksFromDays(usage?.days || {}, now)
    return { now, mat, grid, words, growth, del, breakdown, tags, recent, cold, health, streak }
  }, [graph, clusters, snaps, usage])

  const P = (name, v) => `${name}: ${Math.round(v * 100)}%`
  const collectingDay = Math.min(7, snaps.length)

  // page-gated heavies — ANALYTICS/HEALTH calcs don't run while you're on TODAY
  const colorOfFolder = (fid) => graph.folders.find((f) => f.id === fid)?.color || '#8fa2d9'
  const insights = useMemo(() => {
    if (page !== 'analytics') return null
    const now = Date.now()
    const trend = folderWordTrend(graph.notes, now)
    return {
      trend: trend.folders.map((f) => ({ ...f, color: f.folder === 'OTHER' ? '#565f7d' : colorOfFolder(f.folder) })),
      matrix: linkMatrix(graph.notes, graph.links),
      momentum: tagMomentum(graph.notes, now)
    }
  }, [graph, page])
  const healthCalcs = useMemo(() => {
    if (page !== 'health') return null
    const now = Date.now()
    const groups = new Map()
    for (const u of graph.unresolved || []) {
      if (!groups.has(u.target)) groups.set(u.target, [])
      groups.get(u.target).push(u.in)
    }
    return {
      unresolvedGroups: [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15),
      dupes: duplicateTitles(graph.notes),
      stale90: coldNotes(graph.notes, now, 90).slice(0, 12),
      empties: graph.notes.filter((n) => (n.wordCount || 0) === 0),
      broken: graph.notes.filter((n) => n.fmBroken)
    }
  }, [graph, page])

  const maturityPanel = (i) => (
    <section className="dpanel brk panel-in span4" style={{ '--i': i }}>
      <div className="u-label">MATURITY</div>
      <div className="rule-ticks" />
      <div className="dp-row">
        <Gauge value={d.mat.score} label="SCORE" size={110} />
        <div className="dp-col">
          <div className="dp-sub num">{graph.meta.noteCount} notes · {clusters.clusterCount} clusters</div>
          {[
            ['STRUCTURE', d.mat.parts.structure, 'connected notes / all notes'],
            ['DENSITY', d.mat.parts.density, 'avg links per note vs 6'],
            ['FRESHNESS', d.mat.parts.freshness, 'notes touched in 60d'],
            ['CONSISTENCY', d.mat.parts.consistency, 'active days in last 30 vs 12'],
            ['DEPTH', d.mat.parts.depth, 'median words vs 150']
          ].map(([label, v, tip]) => (
            <div key={label} className="dp-bar" data-tip={`${P(label, v)} — ${tip}`}>
              <span className="u-label">{label}</span>
              <span className="bar"><i style={{ width: `${v * 100}%` }} /></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )

  const suggestionsPanel = (i) =>
    suggestions.length > 0 && (
      <section className="dpanel brk panel-in span4" style={{ '--i': i }}>
        <div className="u-label" data-tip="Notes that share rare vocabulary but aren't linked yet">
          SYNAPSE SUGGESTIONS · {suggestions.length}
        </div>
        <div className="rule-ticks" />
        {suggestions.slice(0, 8).map((s) => {
          const ta = graph.notes.find((n) => n.id === s.a)?.title || s.a
          const tb = graph.notes.find((n) => n.id === s.b)?.title || s.b
          const target = s.mention?.in || s.a
          const tTarget = graph.notes.find((n) => n.id === target)?.title || target
          return (
            <div key={s.a + s.b} className="sg-row">
              <button className="bl-title" onClick={() => onSelect(s.a)} title="Open note">
                {ta} ↔ {tb}
              </button>
              <button className="sg-link" onClick={() => onAcceptSuggestion?.(s)} title={`Insert wikilink into "${tTarget}" (undoable)`}>
                LINK
              </button>
              <button className="sg-x" onClick={() => onDismissSuggestion?.(s)} title="Dismiss">
                ×
              </button>
            </div>
          )
        })}
      </section>
    )

  const renderOverview = () => (
    <>
      {maturityPanel(0)}
      <StreakPanel d={d} usage={usage} i={1} />
      <section className="dpanel brk panel-in span5" style={{ '--i': 2 }}>
        <div className="u-label">TRENDS {snaps.length < 7 ? `· COLLECTING · DAY ${collectingDay}/7` : ''}</div>
        <div className="rule-ticks" />
        <div className="trend-tiles">
          {[
            ['NOTES', graph.meta.noteCount, d.del.d7?.notes, d.del.d30?.notes],
            ['LINKS', graph.meta.linkCount, d.del.d7?.links, d.del.d30?.links],
            ['WORDS', d.words.total, d.del.d7?.words, d.del.d30?.words]
          ].map(([label, val, w7, w30]) => (
            <div key={label} className="trend-tile">
              <div className="u-label">{label}</div>
              <div className="dnum"><Num value={val} /></div>
              <div className="dchips">
                <DeltaChip v={w7} label="7D" />
                <DeltaChip v={w30} label="30D" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="dpanel brk panel-in span12" style={{ '--i': 3 }}>
        <div className="u-label" data-tip="Each note counts once, on its last-touch day (file mtime)">
          ACTIVITY · 52 WEEKS · BY LAST TOUCH
        </div>
        <div className="rule-ticks" />
        <Heatmap grid={d.grid} />
      </section>
      <section className="dpanel brk panel-in span8" style={{ '--i': 4 }}>
        <div className="u-label">
          BRAIN GROWTH · {d.growth.source === 'snapshots' ? 'DAILY SNAPSHOTS' : 'BY LAST-TOUCH (SNAPSHOT HISTORY BUILDING…)'}
        </div>
        <div className="rule-ticks" />
        <LineChart series={d.growth.series} />
        <div className="dp-sub num">now: {graph.meta.noteCount} notes</div>
      </section>
      <section className="dpanel brk panel-in span4" style={{ '--i': 5 }}>
        <div className="u-label">RECENTLY TOUCHED</div>
        <div className="rule-ticks" />
        {d.recent.map((n) => (
          <button key={n.id} className="cp-item" onClick={() => onSelect(n.id)}>
            <span className="cp-t">{n.title}</span>
            <span className="cp-v num">{relAge(n.mtime, d.now)}</span>
          </button>
        ))}
      </section>
      {suggestionsPanel(6)}
    </>
  )

  const renderToday = () => (
    <>
      <section className="dpanel brk panel-in span5" style={{ '--i': 0 }}>
        <div className="u-label">TODAY · {todayId.split('/').pop()}</div>
        <div className="rule-ticks" />
        {dailyRaw == null ? (
          <div className="dp-col">
            <div className="dp-sub">no daily note yet</div>
            <button className="hud-new" onClick={() => onOpenDaily()}>◐ Start today's note</button>
          </div>
        ) : (
          <pre className="daily-preview">
            {dailyRaw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').split(/\r?\n/).slice(-14).join('\n')}
          </pre>
        )}
        <div className="cap-row">
          <input
            className="nl-filter"
            placeholder="capture a thought… ⏎"
            value={capText}
            onChange={(e) => setCapText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') capture()
            }}
          />
        </div>
      </section>
      <StreakPanel d={d} usage={usage} i={1} />
      <section className="dpanel brk panel-in span4" style={{ '--i': 2 }}>
        <div className="u-label">FLASHCARDS</div>
        <div className="rule-ticks" />
        <div className="dnum xl glowy">{dueCount}<span className="dnum-unit">due</span></div>
        <div className="dp-sub num">{graph.cards?.length || 0} cards in the vault</div>
        {dueCount > 0 ? (
          <button className="hud-new" onClick={onReview}>▸ REVIEW NOW</button>
        ) : (
          <div className="dp-sub ok">deck clear</div>
        )}
      </section>
      <DashCalendar graph={graph} dailyFolder={dailyFolder} onOpenDay={(date) => onOpenDaily(date)} i={3} />
      <section className="dpanel brk panel-in span3" style={{ '--i': 4 }}>
        <div className="u-label">MOMENTUM</div>
        <div className="rule-ticks" />
        <div className="health-grid">
          {[
            ['POMODOROS', usage?.counters?.pomodorosCompleted || 0],
            ['CAPTURES', usage?.counters?.captureSave || 0],
            ['DAILIES', usage?.counters?.dailyOpen || 0],
            ['TASKS DONE', usage?.counters?.taskComplete || 0]
          ].map(([label, v]) => (
            <div key={label} className="health-tile">
              <span className="u-label">{label}</span>
              <span className="num">{v}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="dpanel brk panel-in span4" style={{ '--i': 5 }}>
        <TasksPanel graph={graph} onSelect={onSelect} onToggle={onToggleTask} pending={pendingTasks} limit={16} showEmpty />
      </section>
      <section className="dpanel brk panel-in span4" style={{ '--i': 6 }}>
        <ResurfacePanel graph={graph} onSelect={onSelect} />
      </section>
      {graph.notes.some((n) => n.url) && (
        <section className="dpanel brk panel-in span4" style={{ '--i': 7 }}>
          <ReadingList graph={graph} onSelect={onSelect} />
        </section>
      )}
      {(graph.habitEntries?.length || 0) > 0 && (
        <section className="dpanel brk panel-in span4" style={{ '--i': 8 }}>
          <HabitGrid graph={graph} />
        </section>
      )}
    </>
  )

  const renderAnalytics = () => (
    <>
      <section className="dpanel brk panel-in span4" style={{ '--i': 0 }}>
        <div className="u-label">CORPUS</div>
        <div className="rule-ticks" />
        <div className="dnum"><Num value={d.words.total} /><span className="dnum-unit">words</span></div>
        <div className="dp-sub num">avg {d.words.avg} / note</div>
        <div className="u-label" style={{ marginTop: 10 }}>BIGGEST NOTES</div>
        {d.words.biggest.map((n) => (
          <button key={n.id} className="cp-item" onClick={() => onSelect(n.id)}>
            <span className="cp-t">{n.title}</span>
            <span className="cp-v num">{n.wordCount}</span>
          </button>
        ))}
      </section>
      <section className="dpanel brk panel-in span4" style={{ '--i': 1 }}>
        <div className="u-label" data-tip="Communities detected by label propagation over your wikilinks">
          CLUSTERS · {clusters.clusterCount}
        </div>
        <div className="rule-ticks" />
        {d.breakdown.slice(0, 12).map((c) => (
          <BarRow
            key={c.ci}
            color={CLUSTER_PALETTE[c.ci % CLUSTER_PALETTE.length]}
            label={c.label}
            value={c.size}
            max={d.breakdown[0]?.size || 1}
            onClick={() => onSelect(c.hubId)}
          />
        ))}
        {d.breakdown.length > 12 && <div className="task-more u-label">+{d.breakdown.length - 12} MORE</div>}
      </section>
      <section className="dpanel brk panel-in span4" style={{ '--i': 2 }}>
        <div className="u-label">TOP TAGS</div>
        <div className="rule-ticks" />
        <div className="tagcloud">
          {d.tags.map((t) => (
            <button
              key={t.tag}
              className="chip toggle"
              onClick={() => onFilter({ q: '', folders: [], types: [], statuses: [], tags: [t.tag] })}
            >
              #{t.tag} <span className="tag-x">×{t.count}</span>
            </button>
          ))}
        </div>
      </section>
      {insights && (
        <>
          <section className="dpanel brk panel-in span8" style={{ '--i': 3 }}>
            <div className="u-label" data-tip="Each note's words land on its last-touch week (file mtime)">
              WORDS TOUCHED / WEEK · 26W · BY FOLDER
            </div>
            <div className="rule-ticks" />
            <MultiLine seriesList={insights.trend} />
            <div className="trend-legend">
              {insights.trend.map((f) => (
                <span key={f.folder} className="tl-chip">
                  <i style={{ background: f.color }} />
                  {f.folder === 'OTHER' ? 'OTHER' : cleanFolder(f.folder)}
                </span>
              ))}
            </div>
          </section>
          <section className="dpanel brk panel-in span4" style={{ '--i': 4 }}>
            <div className="u-label" data-tip="Row folder links → column folder. Click a cell to filter the brain.">
              LINK FLOW · FOLDER × FOLDER
            </div>
            <div className="rule-ticks" />
            <svg viewBox={`0 0 ${insights.matrix.folders.length * 16 + 20} ${insights.matrix.folders.length * 16 + 20}`} className="lm-svg">
              {insights.matrix.folders.map((f, i) => (
                <text key={'r' + f} x="16" y={30 + i * 16} className="lm-label" textAnchor="end">
                  <title>{cleanFolder(f)}</title>
                  {cleanFolder(f).slice(0, 2).toUpperCase()}
                </text>
              ))}
              {insights.matrix.folders.map((rf, r) =>
                insights.matrix.folders.map((cf, c) => {
                  const v = insights.matrix.matrix[r][c]
                  return (
                    <rect
                      key={rf + cf}
                      x={20 + c * 16}
                      y={20 + r * 16}
                      width="14"
                      height="14"
                      rx="2"
                      className="lm-cell"
                      fill={r === c ? '#7bffb0' : '#6ea8ff'}
                      fillOpacity={v ? 0.15 + 0.85 * (v / Math.max(1, insights.matrix.max)) : 0.04}
                      onClick={() => onFilter({ q: '', folders: [rf], types: [], statuses: [], tags: [] })}
                    >
                      <title>{`${cleanFolder(rf)} → ${cleanFolder(cf)} · ${v} links`}</title>
                    </rect>
                  )
                })
              )}
            </svg>
          </section>
          <section className="dpanel brk panel-in span4" style={{ '--i': 5 }}>
            <div className="u-label" data-tip="recent = notes touched in 30d carrying the tag">
              TAG MOMENTUM · 30D
            </div>
            <div className="rule-ticks" />
            {insights.momentum.map((t) => (
              <BarRow
                key={t.tag}
                color="#6ea8ff"
                label={'#' + t.tag}
                value={t.recent}
                max={Math.max(1, insights.momentum[0]?.recent || 1)}
                onClick={() => onFilter({ q: '', folders: [], types: [], statuses: [], tags: [t.tag] })}
              />
            ))}
          </section>
        </>
      )}
    </>
  )

  const renderHealth = () => (
    <>
      <section className="dpanel brk panel-in span4" style={{ '--i': 0 }}>
        <div className="u-label">NEEDS ATTENTION</div>
        <div className="rule-ticks" />
        {d.health.orphans > 0 ? (
          <button className="dp-sub orphan-btn" onClick={onTriage} data-tip="Triage orphans — guided linking">
            ORPHANS {d.health.orphans} · TRIAGE ▸
          </button>
        ) : (
          <div className="dp-sub">ORPHANS 0</div>
        )}
        {d.cold.slice(0, 5).map((c) => (
          <button key={c.note.id} className="cp-item" onClick={() => onSelect(c.note.id)}>
            <span className="cp-t">{c.note.title}</span>
            <span className="cp-v num">{c.ageDays}d</span>
          </button>
        ))}
        {!d.cold.length && <div className="dp-sub ok">no cold notes — everything's warm</div>}
        <div className="health-grid">
          {[
            ['L/NOTE', d.health.linksPerNote],
            ['LINKED', `${d.health.connectedPct}%`],
            ['UNRESOLVED', d.health.unresolved],
            ['BRIDGES', d.health.bridges]
          ].map(([label, v]) => (
            <div key={label} className="health-tile">
              <span className="u-label">{label}</span>
              <span className="num">{v}</span>
            </div>
          ))}
        </div>
      </section>
      {healthCalcs && (
        <>
          <section className="dpanel brk panel-in span4" style={{ '--i': 1 }}>
            <div className="u-label" data-tip="Wikilinks pointing at notes that don't exist">
              UNRESOLVED WIKILINKS · {(graph.unresolved || []).length}
            </div>
            <div className="rule-ticks" />
            {healthCalcs.unresolvedGroups.map(([target, ins]) => (
              <button key={target} className="cp-item" onClick={() => onSelect(ins[0])} data-tip={`referenced from ${ins.length} note${ins.length > 1 ? 's' : ''} — open the first`}>
                <span className="cp-t">[[{target}]]</span>
                <span className="cp-v num">×{ins.length}</span>
              </button>
            ))}
            {!healthCalcs.unresolvedGroups.length && <div className="dp-sub ok">all wikilinks resolve</div>}
          </section>
          <section className="dpanel brk panel-in span4" style={{ '--i': 2 }}>
            <div className="u-label" data-tip="Same title = wikilink resolution hazard">
              DUPLICATE TITLES · {healthCalcs.dupes.length}
            </div>
            <div className="rule-ticks" />
            {healthCalcs.dupes.slice(0, 6).map((group) => (
              <div key={group[0].id} className="dup-group">
                <div className="dp-sub">{group[0].title}</div>
                {group.map((n) => (
                  <button key={n.id} className="cp-item" onClick={() => onSelect(n.id)}>
                    <span className="cp-t">{cleanFolder(n.folder)}</span>
                    <span className="cp-v num">{n.wordCount}w</span>
                  </button>
                ))}
              </div>
            ))}
            {!healthCalcs.dupes.length && <div className="dp-sub ok">every title is unique</div>}
          </section>
          <section className="dpanel brk panel-in span4" style={{ '--i': 3 }}>
            <div className="u-label">STALE · 90D+</div>
            <div className="rule-ticks" />
            {healthCalcs.stale90.map((c) => (
              <button key={c.note.id} className="cp-item" onClick={() => onSelect(c.note.id)}>
                <span className="cp-t">{c.note.title}</span>
                <span className="cp-v num">{c.ageDays}d</span>
              </button>
            ))}
            {!healthCalcs.stale90.length && <div className="dp-sub ok">nothing older than 90 days untouched</div>}
          </section>
          <section className="dpanel brk panel-in span4" style={{ '--i': 4 }}>
            <div className="u-label">EMPTY NOTES · {healthCalcs.empties.length}</div>
            <div className="rule-ticks" />
            {healthCalcs.empties.slice(0, 8).map((n) => (
              <button key={n.id} className="cp-item" onClick={() => onSelect(n.id)}>
                <span className="cp-t">{n.title}</span>
                <span className="cp-v num">{cleanFolder(n.folder)}</span>
              </button>
            ))}
            {!healthCalcs.empties.length && <div className="dp-sub ok">no empty stubs</div>}
          </section>
          <section className="dpanel brk panel-in span4" style={{ '--i': 5 }}>
            <div className="u-label" data-tip="YAML frontmatter that failed to parse — properties invisible">
              BROKEN FRONTMATTER · {healthCalcs.broken.length}
            </div>
            <div className="rule-ticks" />
            {healthCalcs.broken.slice(0, 8).map((n) => (
              <button key={n.id} className="cp-item" onClick={() => onSelect(n.id)}>
                <span className="cp-t">{n.title}</span>
                <span className="cp-v num">{cleanFolder(n.folder)}</span>
              </button>
            ))}
            {!healthCalcs.broken.length && <div className="dp-sub ok">all frontmatter parses</div>}
          </section>
        </>
      )}
    </>
  )

  return (
    <div className="mode-scrim dash-scrim">
      <div className="dash-tabs">
        {PAGES.map((p) => (
          <button key={p} className={`u-label sk-tab${page === p ? ' on' : ''}`} onClick={() => go(p)}>
            {p.toUpperCase()}
          </button>
        ))}
        <span className="dash-tabs-hint u-label">[ ] TO CYCLE</span>
      </div>
      <div className="dash-grid">
        {page === 'overview' && renderOverview()}
        {page === 'today' && renderToday()}
        {page === 'analytics' && renderAnalytics()}
        {page === 'health' && renderHealth()}
      </div>
    </div>
  )
}
