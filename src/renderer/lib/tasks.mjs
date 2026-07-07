// Checkbox-task extraction. Parsed on the FULL raw file (frontmatter included)
// so line numbers match what's on disk — required by the future toggle
// write-back. Read-only this slice.
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

export function openTasks(notes) {
  const all = []
  for (const n of notes) {
    for (const t of n.tasks || []) {
      if (!t.done) all.push({ ...t, mtime: n.mtime || 0, title: n.title })
    }
  }
  return all.sort((a, b) => b.mtime - a.mtime)
}
