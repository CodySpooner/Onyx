// Note templates: any top-level folder whose name contains "template"
// (the user's vault has "08 - Templates"). Templates are read-only sources.

export function findTemplateFolder(folders) {
  const hit = folders.find((f) => /template/i.test(f.id))
  return hit ? hit.id : null
}

const pad = (n) => String(n).padStart(2, '0')

// Case/space-insensitive {{token}} substitution; unknown tokens pass through.
export function applyTemplate(raw, vars) {
  const now = vars.now instanceof Date ? vars.now : new Date()
  const map = {
    title: vars.title ?? '',
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`
  }
  return String(raw).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, token) => {
    const key = token.toLowerCase()
    return key in map ? map[key] : m
  })
}
