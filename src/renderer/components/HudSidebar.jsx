import { useMemo } from 'react'
import { Gauge } from './Gauge.jsx'
import { TasksPanel } from './TasksPanel.jsx'
import { degree, cleanFolder } from '../lib/stats.mjs'

const uniq = (a) => [...new Set(a.filter(Boolean))].sort()

export function HudSidebar({ graph, stats, filter, onFilter, featured, onSelect, onCreate, onOpenDaily, pins = [], dueCount = 0, onReview }) {
  const facets = useMemo(
    () => ({
      types: uniq(graph.notes.map((n) => n.type)),
      tags: uniq(graph.notes.flatMap((n) => n.tags || []))
    }),
    [graph]
  )
  const colorOf = (fid) => (graph.folders.find((f) => f.id === fid) || {}).color || '#8fa2d9'
  const toggle = (k, v) => {
    const s = new Set(filter[k])
    if (s.has(v)) s.delete(v)
    else s.add(v)
    onFilter({ ...filter, [k]: [...s] })
  }

  return (
    <aside className="hud-left glass">
      <div className="hud-brand">◑ ONYX</div>

      <input
        className="hud-search"
        placeholder="FILTER…"
        value={filter.q}
        onChange={(e) => onFilter({ ...filter, q: e.target.value })}
      />

      <div className="hud-btnrow">
        <button className="hud-new" onClick={onCreate}>
          ＋ New note
        </button>
        <button className="hud-new" onClick={onOpenDaily}>
          ◐ Today
        </button>
      </div>

      {dueCount > 0 && (
        <button className="hud-new review-badge" onClick={onReview}>
          ▸ REVIEW · {dueCount} DUE
        </button>
      )}

      {pins.length > 0 && (
        <div className="hud-sec">
          <div className="sec-h">PINNED</div>
          {pins
            .map((id) => graph.notes.find((n) => n.id === id))
            .filter(Boolean)
            .map((n) => (
              <button key={n.id} className="hubrow" onClick={() => onSelect(n.id)}>
                <i style={{ background: colorOf(n.folder) }} />
                <span className="hub-t">{n.title}</span>
                <span className="hub-d">◉</span>
              </button>
            ))}
        </div>
      )}

      <div className="hud-sec vitals">
        <Gauge value={stats.connectedPct} label="LINKED" />
        <div className="vgrid">
          <div>
            <b>{stats.notes}</b>
            <span>NOTES</span>
          </div>
          <div>
            <b>{stats.links}</b>
            <span>LINKS</span>
          </div>
          <div>
            <b>{stats.folders}</b>
            <span>SYSTEMS</span>
          </div>
          <div>
            <b>{stats.orphans}</b>
            <span>ORPHANS</span>
          </div>
        </div>
      </div>

      {featured && (
        <div className="hud-sec">
          <div className="sec-h">FEATURED NODE</div>
          <div className="feat" style={{ '--c': colorOf(featured.folder) }}>
            <div className="feat-title">{featured.title}</div>
            <div className="feat-meta">
              <span className="feat-folder">{cleanFolder(featured.folder)}</span>
              {featured.type && <span>{featured.type}</span>}
            </div>
            <div className="feat-links">
              <span>→ {featured.outLinks.length} out</span>
              <span>← {featured.inLinks.length} in</span>
              {featured.updated && <span>{String(featured.updated)}</span>}
            </div>
          </div>
        </div>
      )}

      {(facets.types.length > 0 || facets.tags.length > 0) && (
        <div className="hud-sec">
          <div className="sec-h">FILTER</div>
          <div className="chiprow">
            {facets.types.map((t) => (
              <button
                key={String(t)}
                className={`chip toggle ${filter.types.includes(t) ? 'on' : ''}`}
                onClick={() => toggle('types', t)}
              >
                {String(t)}
              </button>
            ))}
          </div>
          <div className="chiprow">
            {facets.tags.slice(0, 18).map((t) => (
              <button
                key={t}
                className={`chip toggle ${filter.tags.includes(t) ? 'on' : ''}`}
                onClick={() => toggle('tags', t)}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="hud-sec hubs">
        <div className="sec-h">TOP HUBS</div>
        {stats.hubs.slice(0, 12).map((n) => (
          <button key={n.id} className="hubrow" onClick={() => onSelect(n.id)}>
            <i style={{ background: colorOf(n.folder) }} />
            <span className="hub-t">{n.title}</span>
            <span className="hub-d">{degree(n)}</span>
          </button>
        ))}
      </div>

      <div className="hud-sec">
        <TasksPanel graph={graph} onSelect={onSelect} limit={8} />
      </div>
    </aside>
  )
}
