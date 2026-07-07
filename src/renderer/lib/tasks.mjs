// Checkbox-task extraction + content-guarded toggle write-back.
// Parsed on the FULL raw file (frontmatter included) so line numbers match
// what's on disk.
const TASK_RE = /^(\s*)[-*] \[( |x|X)\] (.+)$/

export function parseTasks(raw, noteId) {
  const out = []
  const lines = String(raw).split(/\r?\n/)
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*```/.test(l)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const m = l.match(TASK_RE)
    if (m) out.push({ noteId, line: i, text: m[3].trim(), done: m[2] !== ' ', raw: l })
  }
  return out
}

// The CORTEX §10 contract: caller re-reads the file at click time, passes the
// line index AND the exact line text it expects there. If the file moved
// underneath us we relocate by exact match — and REFUSE on ambiguity rather
// than guess (0 or 2+ matches → null). CRLF flavor preserved.
// → { next, nowDone } | null
export function toggleTask(raw, line, expectedLine) {
  const text = String(raw)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  let idx = lines[line] === expectedLine ? line : -1
  if (idx === -1) {
    const matches = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === expectedLine) matches.push(i)
    }
    if (matches.length !== 1) return null
    idx = matches[0]
  }
  const m = lines[idx].match(TASK_RE)
  if (!m) return null
  const nowDone = m[2] === ' '
  lines[idx] = lines[idx].replace(/^(\s*[-*] )\[( |x|X)\]/, (_, pre, state) => pre + (state === ' ' ? '[x]' : '[ ]'))
  return { next: lines.join(eol), nowDone }
}

export function openTasks(notes) {
  const all = []
  for (const n of notes) {
    for (const t of n.tasks || []) {
      if (!t.done) all.push({ ...t, mtime: n.mtime || 0, title: n.title })
    }
  }
  return all.sort((a, b) => b.mtime - a.mtime)
}
