// Pure helpers for the HUD chrome (tested; no DOM imports).

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

// middle-ellipsis: "C:\Users\…\Xody Bets Website Vault"
export function shortPath(p, max = 42) {
  const s = String(p)
  if (s.length <= max) return s
  const keep = max - 1
  const head = Math.ceil(keep * 0.45)
  const tail = keep - head
  return s.slice(0, head) + '…' + s.slice(s.length - tail)
}

// exponential moving average of instantaneous fps
export function emaFps(prev, deltaMs, alpha = 0.1) {
  if (!deltaMs || deltaMs <= 0) return prev
  const inst = 1000 / deltaMs
  return prev + alpha * (inst - prev)
}

export function fpsTier(fps) {
  return fps >= 50 ? 'ok' : fps >= 30 ? 'warn' : 'err'
}

// POST-style boot readout lines with monotonic reveal times (ms)
export function bootLines({ path = '', notes = 0, links = 0, clusters = 0 }) {
  return [
    { t: 0, text: `VAULT ............. ${shortPath(path, 34)}` },
    { t: 120, text: `NOTES ............. ${notes}` },
    { t: 240, text: `LINKS ............. ${links}` },
    { t: 360, text: `CLUSTERS .......... ${clusters}` },
    { t: 520, text: 'SYNAPTIC MESH ..... OK' },
    { t: 700, text: 'RENDER PIPELINE ... OK' }
  ]
}
