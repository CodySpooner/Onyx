import { useEffect, useRef, useState } from 'react'
import { shortPath, emaFps, fpsTier } from '../lib/hud.mjs'
import { Num } from './chrome.jsx'
import { Pomodoro } from './Pomodoro.jsx'

// FPS: one rAF loop writing DIRECTLY to the DOM node at 2Hz — no setState
// per frame, keeps measuring even while the brain canvas is paused.
function useFps(elRef) {
  useEffect(() => {
    let fps = 60
    let last = performance.now()
    let lastPaint = 0
    let raf
    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) {
        last = t
        return
      }
      fps = emaFps(fps, t - last)
      last = t
      if (t - lastPaint > 500 && elRef.current) {
        lastPaint = t
        elRef.current.textContent = `${Math.round(fps)} FPS`
        elRef.current.dataset.tier = fpsTier(fps)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [elRef])
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const p = (n) => String(n).padStart(2, '0')
  return <span className="num">{`${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`}</span>
}

export function StatusBar({ graph, clusterCount, vaultPath, onPickVault, onPomodoroDone }) {
  const fpsRef = useRef(null)
  useFps(fpsRef)

  const [version, setVersion] = useState('')
  const [updateReady, setUpdateReady] = useState(null)
  const [indexing, setIndexing] = useState(false)

  useEffect(() => {
    window.onyx.getVersion?.().then(setVersion)
  }, [])

  useEffect(() => {
    const un = window.onyx.onUpdate?.((s) => {
      if (s?.status === 'ready') setUpdateReady(s.info?.version || '')
    })
    return () => un?.()
  }, [])

  useEffect(() => {
    setIndexing(true)
    const t = setTimeout(() => setIndexing(false), 800)
    return () => clearTimeout(t)
  }, [graph])

  return (
    <footer className="statusbar">
      <span className="sb-seg">
        <span className={`sdot ${indexing ? 'warn' : ''}`} />
        {indexing ? 'INDEXING' : 'SYS NOMINAL'}
      </span>
      <button className="sb-seg sb-vault" onClick={onPickVault} title={vaultPath}>
        {shortPath(vaultPath || '', 42)}
      </button>
      <span className="sb-seg">
        <Num value={graph?.meta?.noteCount ?? 0} /> N · <Num value={graph?.meta?.linkCount ?? 0} /> L ·{' '}
        <Num value={clusterCount ?? 0} /> C
      </span>
      <span className="sb-spacer" />
      <Pomodoro onCompleted={onPomodoroDone} />
      <span className="sb-seg num" ref={fpsRef} data-tier="ok">
        — FPS
      </span>
      {updateReady ? (
        <button className="sb-seg sb-update" onClick={() => window.onyx.installUpdate?.()}>
          v{version} → v{updateReady} READY
        </button>
      ) : (
        <span className="sb-seg">v{version}</span>
      )}
      <span className="sb-seg">
        <Clock />
      </span>
    </footer>
  )
}
