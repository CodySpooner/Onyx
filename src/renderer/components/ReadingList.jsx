import { useMemo } from 'react'
import { setFrontmatterKey } from '../lib/frontmatter.mjs'
import { bus } from '../lib/bus.mjs'

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Notes with frontmatter `url:` become the reading list. Read/unread toggles
// write `read:` back via the byte-preserving frontmatter writer.
export function ReadingList({ graph, onSelect }) {
  const items = useMemo(
    () =>
      graph.notes
        .filter((n) => n.url)
        .sort((a, b) => (a.read === b.read ? (b.mtime || 0) - (a.mtime || 0) : a.read ? 1 : -1)),
    [graph]
  )

  const toggleRead = async (n) => {
    const raw = await window.onyx.readNote(n.id)
    if (raw == null) {
      bus.emit('toast', { msg: '✗ note unreadable — try again', kind: 'err', ttl: 3000 })
      return
    }
    const ok = await window.onyx.writeNote(n.id, setFrontmatterKey(raw, 'read', !n.read))
    if (!ok) bus.emit('toast', { msg: '✗ could not update read state', kind: 'err', ttl: 3000 })
  }

  if (!items.length) return null
  const unread = items.filter((n) => !n.read).length
  return (
    <>
      <div className="u-label">READING LIST{unread ? ` · ${unread} UNREAD` : ''}</div>
      <div className="rule-ticks" />
      {items.slice(0, 10).map((n) => (
        <div key={n.id} className="rl-row">
          <button className={`rl-dot ${n.read ? 'read' : ''}`} title={n.read ? 'Mark unread' : 'Mark read'} onClick={() => toggleRead(n)}>
            {n.read ? '●' : '○'}
          </button>
          <button className="rl-title" onClick={() => onSelect(n.id)}>
            {n.title}
          </button>
          <span className="rl-host">{host(n.url)}</span>
          <button className="rl-open" title="Open in browser" onClick={() => window.onyx.openExternal?.(n.url)}>
            ↗
          </button>
        </div>
      ))}
    </>
  )
}
