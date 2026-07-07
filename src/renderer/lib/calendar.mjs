// Month grid for the daily-note calendar. Noon-anchored local dates
// (daily.mjs trick) so DST transitions can't shift a cell across midnight.
import { dailyId } from './daily.mjs'

const pad = (n) => String(n).padStart(2, '0')

// (year, monthIndex 0-11) → { label, weeks: [[{y,m,d,inMonth,dateStr}] x7] x6 }
export function monthGrid(year, month) {
  const first = new Date(year, month, 1, 12)
  const label = first.toLocaleString('en-US', { month: 'long' }).toUpperCase() + ' ' + year
  // Monday-start: JS getDay() is 0=Sun..6=Sat → offset back to the Monday on/before the 1st
  const back = (first.getDay() + 6) % 7
  const cursor = new Date(year, month, 1 - back, 12)
  const weeks = []
  for (let w = 0; w < 6; w++) {
    const row = []
    for (let d = 0; d < 7; d++) {
      row.push({
        y: cursor.getFullYear(),
        m: cursor.getMonth(),
        d: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        dateStr: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(row)
  }
  return { label, weeks }
}

// stamp has:boolean per cell via dailyId membership in the live note-id set
export function markDays(weeks, noteIdSet, dailyFolder) {
  return weeks.map((row) =>
    row.map((c) => ({ ...c, has: noteIdSet.has(dailyId(new Date(c.y, c.m, c.d, 12), dailyFolder)) }))
  )
}
