// Pomodoro timing math — derived, never accumulated: wall-clock lag,
// sleep, or render jank cannot corrupt the session. Pure + tested.

export function startSession(now, phase = 'work') {
  return { phase, startedAt: now, pausedAt: null, pausedTotal: 0 }
}

export function pause(s, now) {
  if (!s || s.pausedAt != null) return s
  return { ...s, pausedAt: now }
}

export function resume(s, now) {
  if (!s || s.pausedAt == null) return s
  return { ...s, pausedAt: null, pausedTotal: s.pausedTotal + (now - s.pausedAt) }
}

export function elapsed(s, now) {
  if (!s) return 0
  return (s.pausedAt ?? now) - s.startedAt - s.pausedTotal
}

// cfg: { work: minutes, break: minutes }
export function remaining(s, now, cfg) {
  if (!s) return 0
  const total = (s.phase === 'work' ? cfg.work : cfg.break) * 60000
  return total - elapsed(s, now)
}

// returns { session, completedWork } — call when remaining <= 0
export function advance(s, now) {
  if (!s) return { session: null, completedWork: false }
  const completedWork = s.phase === 'work'
  return { session: startSession(now, completedWork ? 'break' : 'work'), completedWork }
}

export function fmt(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
