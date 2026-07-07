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

  // title-mention bonus: a's body speaks b's name without linking it
  const noteById = new Map(notes.map((n) => [n.id, n]))
  const out = []
  for (const [key, p] of pairScore) {
    const [a, b] = key.split('|')
    let mention = null
    for (const [src, dst] of [[a, b], [b, a]]) {
      const title = String(noteById.get(dst)?.title || '')
      if (title.length < 4) continue
      const hay = contentOf(noteById.get(src)).replace(FENCE_RE, ' ').replace(/\[\[[^\]]*\]\]/g, ' ')
      const re = new RegExp('\\b' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      if (re.test(hay)) {
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

// The one vault write: wrap the first unlinked whole-word mention, or file
// the link under ## Related. Returns raw unchanged if [[title]] already there.
export function insertWikilink(raw, title, mention = null) {
  const text = String(raw)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const already = new RegExp('\\[\\[' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\|[^\\]]*)?\\]\\]', 'i')
  if (already.test(text)) return text

  if (mention) {
    const lines = text.split(/\r?\n/)
    const re = new RegExp('\\b(' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'i')
    let fence = false
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i])) {
        fence = !fence
        continue
      }
      if (fence || lines[i].includes('[[')) continue
      const m = lines[i].match(re)
      if (m) {
        lines[i] = lines[i].slice(0, m.index) + '[[' + m[1] + ']]' + lines[i].slice(m.index + m[1].length)
        return lines.join(eol)
      }
    }
    // mention promised but not found in clean text — fall through to Related
  }

  const relRe = /^## Related[ \t]*$/m
  const m = text.match(relRe)
  if (m) {
    const at = m.index + m[0].length
    return text.slice(0, at) + eol + '- [[' + title + ']]' + text.slice(at)
  }
  const base = text.endsWith(eol) ? text.slice(0, -eol.length) : text
  return base + eol + eol + '## Related' + eol + '- [[' + title + ']]' + eol
}
