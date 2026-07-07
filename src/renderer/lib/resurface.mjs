// Daily serendipity: bring one forgotten note back. Deterministic per
// calendar day (seeded by the date string) so the pick is stable all day.
import { fnv1a32 } from './hash.mjs'

const DAY = 86400000

// dateStr: local 'YYYY-MM-DD'; now: epoch ms of the same moment
export function resurfacePick(notes, dateStr, now) {
  if (!notes.length) return null
  const seed = fnv1a32(dateStr)
  const [y, m, d] = dateStr.split('-').map(Number)

  // 1) anniversary: same month+day, earlier year
  const anniversaries = notes.filter((n) => {
    if (!n.mtime) return false
    const t = new Date(n.mtime)
    return t.getMonth() + 1 === m && t.getDate() === d && t.getFullYear() < y
  })
  if (anniversaries.length) {
    const pool = [...anniversaries].sort((a, b) => (a.id < b.id ? -1 : 1))
    const pick = pool[seed % pool.length]
    return { note: pick, reason: 'anniversary', years: y - new Date(pick.mtime).getFullYear() }
  }

  // 2) cold: untouched > 60 days
  const cold = notes.filter((n) => n.mtime && now - n.mtime > 60 * DAY)
  if (cold.length) {
    const pool = [...cold].sort((a, b) => (a.id < b.id ? -1 : 1))
    const pick = pool[seed % pool.length]
    return { note: pick, reason: 'cold', days: Math.floor((now - pick.mtime) / DAY) }
  }

  // 3) fallback: rotate through the 20 oldest
  const pool = [...notes].sort((a, b) => (a.mtime || 0) - (b.mtime || 0)).slice(0, 20)
  return { note: pool[seed % pool.length], reason: 'old' }
}
