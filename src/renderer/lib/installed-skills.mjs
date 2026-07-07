// Pure helpers for the ARSENAL showcase (installed Claude skills).
// The fs walking lives in src/main/claude-skills.js; everything testable is here.

// segment-wise numeric compare, localeCompare fallback for non-semver dirs
export function cmpVersion(a, b) {
  const as = String(a).split('.')
  const bs = String(b).split('.')
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i++) {
    const an = Number(as[i] ?? 0)
    const bn = Number(bs[i] ?? 0)
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      if (an !== bn) return an - bn
    } else {
      const c = String(as[i] ?? '').localeCompare(String(bs[i] ?? ''))
      if (c !== 0) return c
    }
  }
  return 0
}

// hover-card one-liner: first paragraph, minus "Use when:" boilerplate, ≤160
export function blurb(description) {
  let d = String(description || '').trim()
  for (const marker of ['\n\n', ' Use when:', " Don't use when:", ' Trigger:']) {
    const at = d.indexOf(marker)
    if (at > 0) d = d.slice(0, at)
  }
  d = d.replace(/\s+/g, ' ').trim()
  return d.length > 160 ? d.slice(0, 159) + '…' : d
}

// skills: [{id, name, source, plugin, ...}] → same array with .group set.
// Plugin name → its own group; user skills group by shared name prefix when
// ≥3 siblings share it (firecrawl-* → FIRECRAWL); leftovers + singleton
// groups merge into TOOLKIT.
export function groupSkills(skills) {
  const out = skills.map((s) => ({ ...s }))
  for (const s of out) {
    if (s.source === 'plugin' && s.plugin) {
      s.group = s.plugin.replace(/^claude-/, '').replace('ui-ux-pro-max', 'ui/ux').toUpperCase()
    }
  }
  const users = out.filter((s) => s.source !== 'plugin' || !s.plugin)
  const prefixCount = new Map()
  for (const s of users) {
    const p = s.name.split('-')[0]
    prefixCount.set(p, (prefixCount.get(p) || 0) + 1)
  }
  for (const s of users) {
    const p = s.name.split('-')[0]
    s.group = (prefixCount.get(p) || 0) >= 3 ? p.toUpperCase() : 'TOOLKIT'
  }
  // singleton/duo sectors waste 40 degrees — fold them into the toolkit
  const size = new Map()
  for (const s of out) size.set(s.group, (size.get(s.group) || 0) + 1)
  for (const s of out) {
    if ((size.get(s.group) || 0) < 2) s.group = 'TOOLKIT'
  }
  return out
}

// display name inside a prefix-group: drop the group's own prefix
export function displayName(skill) {
  const g = String(skill.group || '').toLowerCase()
  const n = String(skill.name)
  if (n.toLowerCase().startsWith(g + '-')) return n.slice(g.length + 1)
  return n
}

// radial sector layout: sector width ∝ sqrt(count); skills BALANCED across
// arcs (not inner-first) so the constellation fills the canvas.
export const ARC_RADII = [200, 290, 380, 450]

export function arsenalLayout(groups) {
  // groups: Map<groupName, skills[]> (insertion order respected)
  const entries = [...groups.entries()]
  const total = entries.reduce((a, [, list]) => a + Math.sqrt(list.length), 0)
  const placed = []
  const sectors = []
  let cursor = -90
  for (const [g, list] of entries) {
    const span = (360 * Math.sqrt(list.length)) / total
    sectors.push({ group: g, start: cursor, span, mid: cursor + span / 2, count: list.length })
    const n = list.length
    const nArcs = Math.min(ARC_RADII.length, Math.ceil(n / 8))
    const base = Math.floor(n / nArcs)
    const extra = n % nArcs
    let i = 0
    for (let arc = 0; arc < nArcs; arc++) {
      const onThisArc = base + (arc < extra ? 1 : 0)
      for (let pos = 0; pos < onThisArc; pos++, i++) {
        const s = list[i]
        const angle = cursor + ((pos + 1) * span) / (onThisArc + 1)
        const rad = (angle * Math.PI) / 180
        placed.push({ id: s.id, x: Math.cos(rad) * ARC_RADII[arc], y: Math.sin(rad) * ARC_RADII[arc], angle, arc, skill: s })
      }
    }
    cursor += span
  }
  return { placed, sectors }
}
