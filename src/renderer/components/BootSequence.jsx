import { useEffect, useRef, useState } from 'react'
import { bootLines, shortPath } from '../lib/hud.mjs'
import { Num } from './chrome.jsx'

const BOOT_MIN_MS = 1400

// Cinematic boot: ONYX types in, POST lines reveal, progress rule fills,
// then dissolves the moment BOTH the timer AND the graph are ready.
export function BootSequence({ graph, clusterCount = 0, vaultPath = '', onDone }) {
  const [elapsed, setElapsed] = useState(false)
  const [out, setOut] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), BOOT_MIN_MS)
    return () => clearTimeout(t)
  }, [])

  const ready = elapsed && graph !== null
  useEffect(() => {
    if (ready && !doneRef.current) {
      doneRef.current = true
      setOut(true)
    }
  }, [ready])

  const lines = bootLines({
    path: vaultPath,
    notes: graph?.meta?.noteCount ?? 0,
    links: graph?.meta?.linkCount ?? 0,
    clusters: clusterCount
  })

  return (
    <div
      className={`boot ${out ? 'boot-out' : ''}`}
      onTransitionEnd={(e) => {
        if (out && e.propertyName === 'opacity') onDone?.()
      }}
    >
      <div className="boot-inner brk">
        <div className="boot-mark">ONYX</div>
        <div className="boot-scan" />
        <div className="boot-post">
          {lines.map((l, i) => (
            <div key={i} className="boot-line" style={{ animationDelay: `${350 + l.t}ms` }}>
              {i === 0 ? (
                <>VAULT ............. {shortPath(vaultPath, 34)}</>
              ) : i >= 1 && i <= 3 ? (
                <>
                  {['NOTES ............. ', 'LINKS ............. ', 'CLUSTERS .......... '][i - 1]}
                  <Num value={[graph?.meta?.noteCount ?? 0, graph?.meta?.linkCount ?? 0, clusterCount][i - 1]} dur={400} />
                </>
              ) : (
                <>
                  {l.text.replace(/OK$/, '')}
                  <span className="boot-ok">OK</span>
                </>
              )}
            </div>
          ))}
          {!graph && elapsed && (
            <div className="boot-line boot-wait">
              <span className="sdot" /> INDEXING VAULT…
            </div>
          )}
        </div>
        <div className="rule-progress boot-rule">
          <i style={{ width: graph ? '100%' : '92%' }} />
        </div>
      </div>
    </div>
  )
}
