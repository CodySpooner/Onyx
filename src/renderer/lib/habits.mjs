// Habit tracking parsed from daily notes: checkbox lines tagged #habit.
// Read-only aggregation; travel days (no daily note) don't read as failure.
const CHECK_RE = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/
const HABIT_TAG = /(^|\s)#habit(?=\s|$)/
const DATE_RE = /(\d{4})-(\d{2})-(\d{2})/

export function dailyDateFromId(id) {
  const base = String(id).split('/').pop().replace(/\.md$/, '')
  const m = base.match(DATE_RE)
  if (!m) return null
  const [, y, mo, d] = m
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null
  return `${y}-${mo}-${d}`
}

// → [{ date, name, key, done }]
export function parseHabitLines(raw, date) {
  const out = []
  const lines = String(raw).split(/\r?\n/)
  let fence = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const m = line.match(CHECK_RE)
    if (!m) continue
    const rest = m[2]
    if (!HABIT_TAG.test(rest)) continue
    const name = rest.replace(HABIT_TAG, ' ').replace(/\s+/g, ' ').trim()
    if (!name) continue
    out.push({ date, name, key: name.toLowerCase(), done: m[1] !== ' ' })
  }
  return out
}

// entries across all daily notes → per-habit 30-day grid
// state: done | missed (daily note exists, habit unchecked/absent) | none
export function habitGrid(entries, todayStr, days = 30) {
  const dailyDates = new Set(entries.map((e) => e.date))
  const byKey = new Map()
  for (const e of entries) {
    if (!byKey.has(e.key)) byKey.set(e.key, { name: e.name, days: new Map(), count: 0 })
    const h = byKey.get(e.key)
    h.count++
    h.days.set(e.date, h.days.get(e.date) || e.done) // done wins over not-done
    if (e.done) h.days.set(e.date, true)
  }

  const dates = []
  const [y, m, d] = todayStr.split('-').map(Number)
  const cursor = new Date(y, m - 1, d, 12)
  cursor.setDate(cursor.getDate() - (days - 1))
  for (let i = 0; i < days; i++) {
    dates.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    )
    cursor.setDate(cursor.getDate() + 1)
  }

  const habits = [...byKey.values()]
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1))
    .slice(0, 8)
    .map((h) => {
      const cells = dates.map((date) => ({
        date,
        state: h.days.get(date) === true ? 'done' : dailyDates.has(date) ? 'missed' : 'none'
      }))
      const done = cells.filter((c) => c.state === 'done').length
      const missed = cells.filter((c) => c.state === 'missed').length
      const pct = done + missed ? Math.round((100 * done) / (done + missed)) : 0
      // streak anchored at today, or yesterday if today has no entry yet
      let streak = 0
      let i = cells.length - 1
      if (cells[i] && cells[i].state !== 'done') i--
      for (; i >= 0; i--) {
        if (cells[i].state === 'done') streak++
        else if (cells[i].state === 'missed') break
      }
      return { name: h.name, cells, pct, streak, done }
    })
  return habits
}
