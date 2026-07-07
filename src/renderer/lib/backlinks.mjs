// Linked-references context extraction: for a note that links TO the open
// note, find the exact lines containing the [[link]]. Pure + tested.

// targetNames: Set of lowercase strings (open note's basename AND title)
export function extractLinkContext(raw, targetNames) {
  const out = []
  const body = String(raw).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const lines = body.split(/\r?\n/)
  let fence = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      fence = !fence
      continue
    }
    if (fence) continue
    let m
    const re = /\[\[([^\]]+)\]\]/g
    let hit = false
    while ((m = re.exec(line))) {
      const target = m[1].split('|')[0].split('#')[0].trim().toLowerCase()
      if (targetNames.has(target)) {
        hit = true
        break
      }
    }
    if (!hit) continue
    let text = line.trim()
    if (text.length > 140) {
      const at = text.toLowerCase().indexOf('[[')
      const start = Math.max(0, Math.min(at - 40, text.length - 140))
      text = (start > 0 ? '…' : '') + text.slice(start, start + 140) + '…'
    }
    out.push({ text })
    if (out.length >= 2) break // ≤2 snippets per linking note
  }
  return out
}
