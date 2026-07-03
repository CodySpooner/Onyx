import { useEffect, useState } from 'react'

export function UpdateToast() {
  const [st, setSt] = useState(null)

  useEffect(() => {
    const unsub = window.onyx.onUpdate?.(setSt)
    window.__onyxUpdate = setSt // verification hook
    return () => unsub?.()
  }, [])

  if (!st || st.status === 'none' || st.status === 'error') return null
  const v = st.info?.version

  if (st.status === 'ready') {
    return (
      <div className="update-toast ready">
        <div className="ut-dot" />
        <div className="ut-body">
          <div className="ut-title">Onyx {v ? `v${v}` : 'update'} ready</div>
          <div className="ut-sub">Restart to install the latest version.</div>
          <div className="ut-actions">
            <button className="ut-primary" onClick={() => window.onyx.installUpdate()}>
              Restart &amp; install
            </button>
            <button className="ut-later" onClick={() => setSt(null)}>
              Later
            </button>
          </div>
        </div>
        <button className="ut-x" onClick={() => setSt(null)}>
          ✕
        </button>
      </div>
    )
  }

  const pct = st.info?.percent
  return (
    <div className="update-toast">
      <div className="ut-dot pulse" />
      <div className="ut-body">
        <div className="ut-title">Update {v ? `v${v}` : ''} available</div>
        <div className="ut-sub">
          {typeof pct === 'number' ? `Downloading… ${pct}%` : 'Downloading in the background…'}
        </div>
        {typeof pct === 'number' && (
          <div className="ut-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
