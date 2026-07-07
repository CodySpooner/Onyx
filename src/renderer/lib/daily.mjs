// Daily-note identity, template, and quick-capture append. Pure + tested.
const pad = (n) => String(n).padStart(2, '0')

export function dailyId(date, folder) {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return folder && folder !== '(root)' ? `${folder}/${d}.md` : `${d}.md`
}

export function isDailyId(id, folder) {
  const esc = String(folder).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${esc}/\\d{4}-\\d{2}-\\d{2}\\.md$`).test(id)
}

export function adjacentDailyId(id, delta, folder) {
  const m = String(id).match(/(\d{4})-(\d{2})-(\d{2})\.md$/)
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12) // noon anchor: DST-safe date math
  d.setDate(d.getDate() + delta)
  return dailyId(d, folder)
}

export function dailyTemplate(date) {
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `---\ntitle: ${iso}\ntype: daily\n---\n\n## Log\n\n## Tasks\n\n## Notes\n`
}

// Insert "- HH:MM — text" after the last non-empty line of the ## Log section.
// Preserves the file's EOL flavor; missing heading → append at EOF.
export function appendCapture(raw, text, now) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const bullet = `- ${pad(now.getHours())}:${pad(now.getMinutes())} — ${text}`
  const lines = raw.split(/\r?\n/)
  const h = lines.findIndex((l) => /^##\s+Log\s*$/.test(l))
  if (h === -1) {
    const trimmed = raw.replace(/\s+$/, '')
    return trimmed + eol + eol + bullet + eol
  }
  let end = lines.length
  for (let i = h + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i
      break
    }
  }
  let insert = h + 1
  for (let i = end - 1; i > h; i--) {
    if (lines[i].trim() !== '') {
      insert = i + 1
      break
    }
  }
  lines.splice(insert, 0, bullet)
  return lines.join(eol)
}
