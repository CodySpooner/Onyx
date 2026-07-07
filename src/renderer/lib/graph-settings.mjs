// The customization studio's brain: a typed settings schema, theme presets,
// validation, and the live-vs-rebuild routing table. Pure, zero imports.

// liveIn: '*' = live-applies in every lens · [ids] = live there · [] = never
// live. rebuildIn (optional): the only lenses that consume the key at build
// time — a change rebuilds those and is a no-op elsewhere. Without rebuildIn,
// any non-live change rebuilds the current lens (conservative default).
export const SCHEMA = [
  { key: 'theme.preset', section: 'theme', label: 'THEME', type: 'enum', options: ['onyx', 'ember', 'ice', 'synthwave', 'mono'], def: 'onyx', liveIn: [], rebuildIn: ['brain', 'atlas', 'nexus'] },
  { key: 'theme.folderColors', section: 'theme', label: 'COLOR BY FOLDER', type: 'bool', def: false, liveIn: [], rebuildIn: ['brain'] },
  { key: 'theme.nebulaDim', section: 'theme', label: 'BACKDROP', type: 'range', min: 0.2, max: 1.5, step: 0.05, def: 1, liveIn: '*' },

  { key: 'look.bloom', section: 'look', label: 'BLOOM', type: 'range', min: 0, max: 1.5, step: 0.05, def: 0.65, liveIn: '*' },
  { key: 'look.bloomThreshold', section: 'look', label: 'BLOOM CUTOFF', type: 'range', min: 0, max: 1, step: 0.05, def: 0.3, liveIn: '*' },
  { key: 'look.exposure', section: 'look', label: 'EXPOSURE', type: 'range', min: 0.5, max: 1.4, step: 0.05, def: 0.85, liveIn: '*' },
  { key: 'look.grain', section: 'look', label: 'FILM GRAIN', type: 'range', min: 0, max: 0.05, step: 0.002, def: 0.012, liveIn: '*' },
  { key: 'look.vignette', section: 'look', label: 'VIGNETTE', type: 'range', min: 0, max: 0.6, step: 0.02, def: 0.28, liveIn: '*' },
  { key: 'look.chroma', section: 'look', label: 'CHROMA FRINGE', type: 'range', min: 0, max: 0.003, step: 0.0001, def: 0.0009, liveIn: '*' },
  { key: 'look.nodeSize', section: 'look', label: 'NODE SIZE', type: 'range', min: 0.5, max: 2, step: 0.05, def: 1, liveIn: ['brain'], rebuildIn: [] },
  { key: 'look.linkOpacity', section: 'look', label: 'LINK OPACITY', type: 'range', min: 0, max: 0.5, step: 0.02, def: 0.1, liveIn: '*' },
  { key: 'look.labelSize', section: 'look', label: 'LABEL SIZE', type: 'range', min: 0.5, max: 2, step: 0.05, def: 1, liveIn: ['brain'], rebuildIn: [] },
  { key: 'look.labelFade', section: 'look', label: 'LABEL REACH', type: 'range', min: 0.4, max: 2, step: 0.1, def: 1, liveIn: ['brain'], rebuildIn: [] },
  { key: 'look.gemShape', section: 'look', label: 'GEM SHAPE', type: 'enum', options: ['auto', 'sphere', 'ico', 'octa', 'dodeca', 'tetra'], def: 'auto', liveIn: [], rebuildIn: ['brain'] },

  { key: 'motion.speed', section: 'motion', label: 'ANIMATION SPEED', type: 'range', min: 0, max: 2, step: 0.1, def: 1, liveIn: '*' },
  { key: 'motion.pulses', section: 'motion', label: 'PULSE DENSITY', type: 'range', min: 0, max: 2, step: 0.25, def: 1, liveIn: [], rebuildIn: ['brain'] },
  { key: 'motion.spin', section: 'motion', label: 'GEM SPIN', type: 'bool', def: true, liveIn: '*' },
  { key: 'motion.spawn', section: 'motion', label: 'SPAWN CASCADE', type: 'bool', def: true, liveIn: [], rebuildIn: ['brain'] },
  { key: 'motion.reduced', section: 'motion', label: 'REDUCED MOTION', type: 'bool', def: false, liveIn: '*' },

  { key: 'physics.repulsion', section: 'physics', label: 'REPULSION', type: 'range', min: 200, max: 2600, step: 50, def: 900, liveIn: ['brain'], rebuildIn: [] },
  { key: 'physics.linkLength', section: 'physics', label: 'LINK LENGTH', type: 'range', min: 10, max: 70, step: 1, def: 27, liveIn: ['brain'], rebuildIn: [] },
  { key: 'physics.spread', section: 'physics', label: 'SPREAD', type: 'range', min: 90, max: 260, step: 5, def: 165, liveIn: ['brain'], rebuildIn: [] },
  { key: 'physics.gravity', section: 'physics', label: 'CENTER PULL', type: 'range', min: 0.0005, max: 0.005, step: 0.0001, def: 0.0016, liveIn: ['brain'], rebuildIn: [] }
]

export const PRESETS = {
  onyx: { name: 'Onyx', clusters: ['#7fd4ff', '#c77dff', '#7bffb0', '#ffd166', '#ff7b9c', '#4cc9f0', '#bdb2ff', '#80ed99', '#ff9f1c', '#f72585', '#9bf6ff', '#fdffb6'], nebula: ['#1c1442', '#0a1a3c'], link: '#86b8ff', pulse: '#bfe0ff', orphan: '#4a5470' },
  ember: { name: 'Ember', clusters: ['#ffb35e', '#ff7b45', '#ff4f4f', '#ffd166', '#ff9f1c', '#e85d75', '#ffc971', '#ff6b35', '#f4a259', '#d1495b', '#ff8c61', '#ffe3b3'], nebula: ['#3a1414', '#241028'], link: '#ff9f6e', pulse: '#ffd9b0', orphan: '#5c4a42' },
  ice: { name: 'Ice', clusters: ['#9bf6ff', '#7fd4ff', '#4cc9f0', '#bde0fe', '#a2d2ff', '#8ecae6', '#73d2de', '#caf0f8', '#90e0ef', '#48bfe3', '#b8f2ff', '#dff6ff'], nebula: ['#0a2038', '#101a4a'], link: '#9fd8ff', pulse: '#e0f7ff', orphan: '#3e4a5c' },
  synthwave: { name: 'Synthwave', clusters: ['#ff2fd6', '#00f0ff', '#c77dff', '#ff6ec7', '#7b2fff', '#00ffc8', '#ff9de2', '#4d5bff', '#ff477e', '#39ddff', '#b967ff', '#05ffa1'], nebula: ['#2b0a4d', '#3d0a3d'], link: '#ff6ec7', pulse: '#9dfcff', orphan: '#4a3a5e' },
  mono: { name: 'Mono', clusters: ['#e8ecf5', '#aeb6c8', '#7d8698', '#5a6272', '#cfd6e4', '#98a1b3', '#6e7789', '#c2c9d8', '#868fa1', '#dfe4ee', '#a4adbf', '#737c8e'], nebula: ['#14161f', '#0c0e16'], link: '#aab4c8', pulse: '#ffffff', orphan: '#3a3f4a' }
}

export const DEFAULTS = Object.fromEntries(SCHEMA.map((r) => [r.key, r.def]))

export const val = (s, key) => (s && s[key] !== undefined ? s[key] : DEFAULTS[key])

export function validateSettings(stored) {
  const out = { ...DEFAULTS }
  if (!stored || typeof stored !== 'object') return out
  for (const row of SCHEMA) {
    const v = stored[row.key]
    if (v === undefined) continue
    if (row.type === 'bool') out[row.key] = !!v
    else if (row.type === 'enum') out[row.key] = row.options.includes(v) ? v : row.def
    else if (row.type === 'range') {
      const n = Number(v)
      out[row.key] = Number.isFinite(n) ? Math.max(row.min, Math.min(row.max, n)) : row.def
    }
  }
  return out
}

// resolved per-frame view of the settings; reduced-motion is a master switch
export function effective(s) {
  const e = { ...DEFAULTS, ...(s || {}) }
  if (e['motion.reduced']) {
    e['motion.speed'] = 0
    e['motion.spin'] = false
    e['motion.spawn'] = false
    e['look.grain'] = 0
    e['motion.pulses'] = 0
  }
  return e
}

export function needsRebuild(prev, next, viewId) {
  if (!prev) return false
  for (const row of SCHEMA) {
    if (val(prev, row.key) === val(next, row.key)) continue
    if (row.liveIn === '*') continue
    if (Array.isArray(row.liveIn) && row.liveIn.includes(viewId)) continue
    if (row.rebuildIn !== undefined && !row.rebuildIn.includes(viewId)) continue // no lens consumes it here
    return true
  }
  return false
}

export function resetSection(s, section) {
  const out = { ...(s || DEFAULTS) }
  for (const row of SCHEMA) {
    if (row.section === section) out[row.key] = row.def
  }
  return out
}

export function paletteFor(s) {
  return PRESETS[val(s, 'theme.preset')] || PRESETS.onyx
}

// deterministic folder→palette-slot mapping (stable under folder reordering)
export function folderColorIndex(folderId) {
  let h = 2166136261
  const str = String(folderId)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 12
}
