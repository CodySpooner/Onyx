import { useEffect, useMemo, useState } from 'react'
import { CATALOG, searchCatalog, markInstalled, vaultTopTags, fitScore, mergeLive } from '../lib/skill-catalog.mjs'

const KIND_COLOR = { skill: '#6ea8ff', plugin: '#c77dff', marketplace: '#7bffb0', tool: '#ffd166' }
const TIER_ORDER = { essential: 0, popular: 1, niche: 2 }

// Discovery only. No install button exists — safety is structural: the app
// can put text on your clipboard and open a browser, nothing else.
export function BrowseSkills({ arsenal, notes }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [live, setLive] = useState(null)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    window.onyx.getBrowseLive?.().then(setLive)
  }, [])

  const topTags = useMemo(() => vaultTopTags(notes || []), [notes])
  const entries = useMemo(() => {
    let list = markInstalled(mergeLive(CATALOG, live?.repos), arsenal?.skills || [])
    list = list.map((e) => ({ ...e, fit: fitScore(e, topTags) }))
    if (filter === 'fits') list = list.filter((e) => e.fit > 0).sort((a, b) => b.fit - a.fit)
    else if (filter === 'installed') list = list.filter((e) => e.installed)
    else if (filter !== 'all') list = list.filter((e) => e.kind === filter)
    if (filter !== 'fits') {
      list.sort((a, b) => (TIER_ORDER[a.tier] ?? 3) - (TIER_ORDER[b.tier] ?? 3) || (b.stars || 0) - (a.stars || 0))
    }
    return searchCatalog(list, q)
  }, [live, arsenal, topTags, filter, q])

  const counts = useMemo(() => {
    const base = markInstalled(mergeLive(CATALOG, live?.repos), arsenal?.skills || [])
    return {
      fits: base.filter((e) => fitScore(e, topTags) > 0).length,
      installed: base.filter((e) => e.installed).length
    }
  }, [live, arsenal, topTags])

  const copy = (e) => {
    navigator.clipboard?.writeText(e.install)
    setCopied(e.id)
    setTimeout(() => setCopied(null), 1500)
  }

  const ago = live?.fetchedAt ? Math.round((Date.now() - live.fetchedAt) / 3600000) : null

  return (
    <div className="browse-wrap">
      <div className="browse-head">
        <input className="browse-search" placeholder="SEARCH SKILLS & PLUGINS…" value={q} onChange={(e) => setQ(e.target.value)} />
        {[
          ['all', 'ALL'],
          ['fits', `FITS YOUR PROJECT · ${counts.fits}`],
          ['installed', `INSTALLED · ${counts.installed}`],
          ['skill', 'SKILLS'],
          ['plugin', 'PLUGINS'],
          ['marketplace', 'MARKETPLACES']
        ].map(([k, label]) => (
          <button key={k} className={`u-label sk-tab${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
        <span className="browse-status u-label">{live ? `LIVE · UPDATED ${ago}H AGO` : 'OFFLINE — CURATED CATALOG'}</span>
      </div>
      <div className="browse-grid">
        {entries.map((e) => (
          <div key={e.id} className="browse-card glass brk">
            <div className="bc-top">
              <span className="sk-name" style={{ color: KIND_COLOR[e.kind] || '#6ea8ff' }}>{e.name}</span>
              {e.installed && <span className="bc-badge on">INSTALLED ✓</span>}
              <span className="bc-badge">{e.kind.toUpperCase()}</span>
              {e.stars != null && <span className="bc-badge num">★ {e.stars}</span>}
              {e.uncertain && <span className="bc-badge dim">UNVERIFIED</span>}
            </div>
            <div className="bc-desc">{e.description}</div>
            <div className="bc-tags">
              {e.tags.slice(0, 5).map((t) => (
                <span key={t} className={`bc-tag${fitScore({ tags: [t] }, topTags) ? ' fit' : ''}`}>#{t}</span>
              ))}
            </div>
            <div className="bc-actions">
              <button className="sg-link" onClick={() => copy(e)}>{copied === e.id ? 'COPIED ✓' : 'COPY INSTALL'}</button>
              {e.url && (
                <button className="bc-repo" onClick={() => window.onyx.openExternal(e.url)}>REPO ↗</button>
              )}
            </div>
          </div>
        ))}
        {!entries.length && <div className="sec-empty">nothing matches — clear the search or filter</div>}
      </div>
    </div>
  )
}
