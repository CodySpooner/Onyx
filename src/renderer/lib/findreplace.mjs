// Vault find & replace core. LITERAL ONLY — no regex in, no $-semantics out.
// The UI rails: preview is mandatory, applies are per-file, every apply
// re-reads the file and is undoable via compare-and-swap snapshot.

const isWord = (ch) => /[A-Za-z0-9_]/.test(ch || '')

function* matches(haystack, needle, { wholeWord = false, caseSensitive = false } = {}) {
  if (!needle) return
  const h = caseSensitive ? haystack : haystack.toLowerCase()
  const n = caseSensitive ? needle : needle.toLowerCase()
  let at = 0
  while ((at = h.indexOf(n, at)) !== -1) {
    const before = haystack[at - 1]
    const after = haystack[at + needle.length]
    if (!wholeWord || (!isWord(before) && !isWord(after))) yield at
    at += needle.length // left-to-right, no overlap
  }
}

// → [{ line, lineText }] one entry per match (line 0-based)
export function searchNote(raw, term, opts) {
  const text = String(raw)
  const out = []
  const lineStarts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1)
  const lineOf = (at) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= at) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const lines = text.split('\n')
  for (const at of matches(text, term, opts)) {
    const line = lineOf(at)
    out.push({ line, lineText: (lines[line] || '').replace(/\r$/, '').trim().slice(0, 120) })
  }
  return out
}

// → { next, count } — replacement inserted verbatim ('$'/'\\' are literal)
export function applyReplace(raw, term, replacement, opts) {
  const text = String(raw)
  let next = ''
  let last = 0
  let count = 0
  for (const at of matches(text, term, opts)) {
    next += text.slice(last, at) + replacement
    last = at + term.length
    count++
  }
  next += text.slice(last)
  return { next, count }
}
