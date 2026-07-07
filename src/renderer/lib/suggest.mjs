// Synapse Suggestions — local lexical link discovery. No embeddings, no API:
// two notes that share RARE vocabulary probably belong together.
// ponytail: lexical only — upgrade path is TF-IDF cosine if precision disappoints.

const STOP = new Set(
  (
    'the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what where which while with would about after again before being below between both during each few further into most other same should through under until because'
  ).split(' ')
)

const FENCE_RE = /```[\s\S]*?```/g

export function tokenize(text) {
  const clean = String(text)
    .replace(FENCE_RE, ' ')
    .replace(/\[\[([^\]]+)\]\]/g, ' $1 ')
    .toLowerCase()
  const out = new Set()
  for (const t of clean.split(/[^a-z0-9']+/)) {
    if (t.length >= 3 && !STOP.has(t)) out.add(t)
  }
  return out
}

// notes: [{id, title, _content|content, outLinks, inLinks}]
// → [{a, b, score, terms, mention?}] — a/b are note ids
export function buildSuggestions(notes, opts = {}) {
  const N = notes.length
  if (N < 3) return []
  const maxPosting = opts.maxPosting ?? 12
  const minScore = opts.minScore ?? 4
  const perNote = opts.perNote ?? 3
  const globalCap = opts.globalCap ?? 60
  const rareMax = Math.max(2, Math.ceil(0.05 * N))

  const contentOf = (n) => n._content ?? n.content ?? ''
  const terms = new Map() // id → Set
  const df = new Map()
  for (const n of notes) {
    const set = tokenize(n.title + ' ' + contentOf(n))
    terms.set(n.id, set)
    for (const t of set) df.set(t, (df.get(t) || 0) + 1)
  }

  const linked = new Set()
  for (const n of notes) {
    for (const o of n.outLinks || []) linked.add(n.id < o ? n.id + '|' + o : o + '|' + n.id)
    for (const o of n.inLinks || []) linked.add(n.id < o ? n.id + '|' + o : o + '|' + n.id)
  }

  // inverted index over rare terms only
  const posting = new Map()
  for (const [id, set] of terms) {
    for (const t of set) {
      const d = df.get(t)
      if (d < 2 || d > rareMax) continue
      if (!posting.has(t)) posting.set(t, [])
      posting.get(t).push(id)
    }
  }

  const pairScore = new Map() // 'a|b' → {score, terms:[]}
  for (const [t, ids] of posting) {
    if (ids.length > maxPosting) continue // hub terms explain nothing
    const w = Math.log(N / df.get(t))
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = ids[i] < ids[j] ? ids[i] + '|' + ids[j] : ids[j] + '|' + ids[i]
        if (linked.has(key)) continue
        if (!pairScore.has(key)) pairScore.set(key, { score: 0, terms: [] })
        const p = pairScore.get(key)
        p.score += w
        p.terms.push(t)
      }
    }
  }

  // title-mention bonus: a's body speaks b's name without linking it.
  // Cleaned content and title regexes are memoized — this loop runs per
  // candidate pair and used to re-regex full note bodies each time.
  const noteById = new Map(notes.map((n) => [n.id, n]))
  const hayCache = new Map()
  const hayOf = (id) => {
    let h = hayCache.get(id)
    if (h === undefined) {
      h = contentOf(noteById.get(id)).replace(FENCE_RE, ' ').replace(/\[\[[^\]]*\]\]/g, ' ')
      hayCache.set(id, h)
    }
    return h
  }
  const reCache = new Map()
  const reOf = (title) => {
    let r = reCache.get(title)
    if (r === undefined) {
      r = new RegExp('\\b' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      reCache.set(title, r)
    }
    return r
  }
  const out = []
  for (const [key, p] of pairScore) {
    if (p.score + 4 < minScore) continue // even the bonus can't save it
    const [a, b] = key.split('|')
    let mention = null
    for (const [src, dst] of [[a, b], [b, a]]) {
      const title = String(noteById.get(dst)?.title || '')
      if (title.length < 4) continue
      if (reOf(title).test(hayOf(src))) {
        p.score += 4
        mention = { in: src, title }
        break
      }
    }
    if (p.score >= minScore) out.push({ a, b, score: Math.round(p.score * 100) / 100, terms: p.terms.slice(0, 6), mention })
  }

  out.sort((x, y) => y.score - x.score)
  const perCount = new Map()
  const kept = []
  for (const s of out) {
    if ((perCount.get(s.a) || 0) >= perNote || (perCount.get(s.b) || 0) >= perNote) continue
    kept.push(s)
    perCount.set(s.a, (perCount.get(s.a) || 0) + 1)
    perCount.set(s.b, (perCount.get(s.b) || 0) + 1)
    if (kept.length >= globalCap) break
  }
  return kept
}

// Orphan triage: every zero-degree note, paired with its best suggestion
// candidates. Orphans with no candidates sort last (skip-only rows).
export function triageQueue(notes, suggestions, dismissed = new Set()) {
  const key = (s) => (s.a < s.b ? s.a + '|' + s.b : s.b + '|' + s.a)
  const rows = notes
    .filter((n) => (n.outLinks?.length || 0) + (n.inLinks?.length || 0) === 0)
    .map((o) => ({
      orphan: o.id,
      candidates: suggestions
        .filter((s) => (s.a === o.id || s.b === o.id) && !dismissed.has(key(s)))
        .sort((x, y) => y.score - x.score)
        .slice(0, 3)
    }))
  rows.sort(
    (a, b) =>
      (b.candidates.length ? 1 : 0) - (a.candidates.length ? 1 : 0) ||
      (a.orphan < b.orphan ? -1 : 1)
  )
  return rows
}

// The one vault write: wrap the first unlinked whole-word mention, or file
// the link under ## Related. Returns raw unchanged if [[target]] already there.
// `target` is the note's FILENAME basename — the only thing wikilinks resolve
// by (here and in Obsidian). `display` is the pretty frontmatter title; when
// they differ the link is written as [[target|display]].
export function insertWikilink(raw, target, mention = null, display = target) {
  const text = String(raw)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const already = new RegExp('\\[\\[' + esc(target) + '(\\|[^\\]]*)?\\]\\]', 'i')
  if (already.test(text)) return text

  if (mention) {
    const lines = text.split(/\r?\n/)
    // the prose mentions the TITLE, not the filename
    const re = new RegExp('\\b(' + esc(display) + ')\\b', 'i')
    let fence = false
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i])) {
        fence = !fence
        continue
      }
      if (fence || lines[i].includes('[[')) continue
      const m = lines[i].match(re)
      if (m) {
        const link = m[1].toLowerCase() === target.toLowerCase() ? '[[' + m[1] + ']]' : '[[' + target + '|' + m[1] + ']]'
        lines[i] = lines[i].slice(0, m.index) + link + lines[i].slice(m.index + m[1].length)
        return lines.join(eol)
      }
    }
    // mention promised but not found in clean text — fall through to Related
  }

  const entry = display.toLowerCase() === target.toLowerCase() ? '- [[' + target + ']]' : '- [[' + target + '|' + display + ']]'
  const relRe = /^## Related[ \t]*$/m
  const m = text.match(relRe)
  if (m) {
    const at = m.index + m[0].length
    return text.slice(0, at) + eol + entry + text.slice(at)
  }
  const base = text.endsWith(eol) ? text.slice(0, -eol.length) : text
  return base + eol + eol + '## Related' + eol + entry + eol
}
