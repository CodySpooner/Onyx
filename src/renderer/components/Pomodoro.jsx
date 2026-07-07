import { useEffect, useRef, useState } from 'react'
import { startSession, pause, resume, remaining, advance, fmt } from '../lib/pomodoro.mjs'
import { bus } from '../lib/bus.mjs'

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => ctx.close()
  } catch {
    /* audio unavailable — silent */
  }
}

const BASE_TITLE = 'Onyx'

export function Pomodoro({ onCompleted }) {
  const [session, setSession] = useState(null)
  const [, force] = useState(0)
  const cfgRef = useRef({ work: 25, break: 5, sound: true })

  useEffect(() => {
    window.onyx.getConfig?.().then((c) => {
      cfgRef.current = {
        work: c.pomodoroWork ?? 25,
        break: c.pomodoroBreak ?? 5,
        sound: c.pomodoroSound !== false
      }
    })
  }, [])

  // 1s cadence: re-render + completion check + title tick (state stays derived)
  useEffect(() => {
    if (!session) {
      document.title = BASE_TITLE
      return
    }
    const t = setInterval(() => {
      const now = Date.now()
      const rem = remaining(session, now, cfgRef.current)
      if (rem <= 0) {
        const { session: next, completedWork } = advance(session, now)
        setSession(next)
        if (completedWork) {
          onCompleted?.()
          bus.emit('toast', { msg: '⏱ SESSION COMPLETE — break time', kind: 'skill', ttl: 4000 })
          if (cfgRef.current.sound) beep()
        } else {
          bus.emit('toast', { msg: '⏱ BREAK OVER — back to work', kind: 'info', ttl: 3000 })
        }
        return
      }
      if (session.pausedAt == null) document.title = `⏱ ${fmt(rem)} · ${BASE_TITLE}`
      force((n) => n + 1)
    }, 1000)
    return () => {
      clearInterval(t)
      document.title = BASE_TITLE
    }
  }, [session, onCompleted])

  if (!session) {
    return (
      <button className="sb-seg sb-pomo" onClick={() => setSession(startSession(Date.now()))} title="Start a 25-minute focus session">
        ⏱ FOCUS
      </button>
    )
  }

  const now = Date.now()
  const rem = remaining(session, now, cfgRef.current)
  const paused = session.pausedAt != null
  return (
    <span className={`sb-seg sb-pomo on ${session.phase}`}>
      <button
        className="sb-pomo-main"
        title={paused ? 'Resume' : 'Pause'}
        onClick={() => setSession(paused ? resume(session, now) : pause(session, now))}
      >
        ⏱ {fmt(rem)} {paused ? '▮▮' : `▍${session.phase.toUpperCase()}`}
      </button>
      <button className="sb-pomo-x" title="Reset" onClick={() => setSession(null)}>
        ✕
      </button>
    </span>
  )
}
