import { useEffect, useMemo, useState } from 'react'
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
import {
  activityGrid, growthSeries, deltas, wordStats,
  clusterBreakdown, topTags, recentNotes, relAge, linkHealth
} from '../lib/dashboard.mjs'

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

export function DashboardMode({ graph, clusters, usage, onSelect, onFilter }) {
  const [snaps, setSnaps] = useState([])
  useEffect(() => {
    window.onyx.getSnapshots?.().then((d) => setSnaps(d || []))
  }, [graph])

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

  return (
    <div className="mode-scrim dash-scrim">
      <div className="dash-grid">
        <section className="dpanel brk panel-in span4" style={{ '--i': 0 }}>
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

        <section className="dpanel brk panel-in span3" style={{ '--i': 1 }}>
          <div className="u-label">STREAK</div>
          <div className="rule-ticks" />
          <div className="dnum xl glowy">{d.streak.current}<span className="dnum-unit">d</span></div>
          <div className="dp-sub">BEST {d.streak.best}d · {d.streak.activeDays} active days</div>
          {!d.streak.activeToday && d.streak.current > 0 && (
            <div className="dp-warn">capture today to keep it</div>
          )}
          <div className="streak-strip">
            {Array.from({ length: 30 }, (_, i) => {
              const t = new Date(d.now)
              t.setDate(t.getDate() - (29 - i))
              const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
              return <i key={k} className={(usage?.days?.[k] || 0) > 0 ? 'on' : ''} />
            })}
          </div>
        </section>

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

        <section className="dpanel brk panel-in span6" style={{ '--i': 6 }}>
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

        <section className="dpanel brk panel-in span6" style={{ '--i': 7 }}>
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

        <section className="dpanel brk panel-in span4" style={{ '--i': 8 }}>
          <div className="u-label">RECENTLY TOUCHED</div>
          <div className="rule-ticks" />
          {d.recent.map((n) => (
            <button key={n.id} className="cp-item" onClick={() => onSelect(n.id)}>
              <span className="cp-t">{n.title}</span>
              <span className="cp-v num">{relAge(n.mtime, d.now)}</span>
            </button>
          ))}
        </section>

        <section className="dpanel brk panel-in span4" style={{ '--i': 9 }}>
          <div className="u-label">NEEDS ATTENTION</div>
          <div className="rule-ticks" />
          <div className="dp-sub">ORPHANS {d.health.orphans}</div>
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

        <section className="dpanel brk panel-in span4" style={{ '--i': 10 }}>
          <TasksPanel graph={graph} onSelect={onSelect} limit={16} showEmpty />
        </section>

        <section className="dpanel brk panel-in span4" style={{ '--i': 11 }}>
          <ResurfacePanel graph={graph} onSelect={onSelect} />
        </section>

        {graph.notes.some((n) => n.url) && (
          <section className="dpanel brk panel-in span4" style={{ '--i': 12 }}>
            <ReadingList graph={graph} onSelect={onSelect} />
          </section>
        )}

        {(graph.habitEntries?.length || 0) > 0 && (
          <section className="dpanel brk panel-in span4" style={{ '--i': 13 }}>
            <HabitGrid graph={graph} />
          </section>
        )}
      </div>
    </div>
  )
}
