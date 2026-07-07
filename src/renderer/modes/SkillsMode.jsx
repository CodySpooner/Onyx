import { useEffect, useMemo, useState } from 'react'
import { hashAngle } from '../lib/graph.mjs'
import { BRANCH_COLORS } from '../lib/skills.mjs'
import { CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { arsenalLayout, displayName } from '../lib/installed-skills.mjs'

const BRANCH_ORDER = ['INTELLIGENCE', 'MEMORY', 'ARCHITECT', 'CARTOGRAPHER', 'RITUALIST', 'CURATOR', 'EXPLORER']
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const DORMANT = '#565f7d'

function polar(angleDeg, r) {
  const a = (angleDeg * Math.PI) / 180
  return [Math.cos(a) * r, Math.sin(a) * r]
}

// The machine's real installed Claude skills, as a constellation of their own.
function Arsenal({ arsenal, onHover }) {
  const layout = useMemo(() => {
    if (!arsenal?.skills?.length) return null
    const groups = new Map()
    const sorted = [...arsenal.skills].sort((a, b) => a.group.localeCompare(b.group))
    for (const s of sorted) {
      if (!groups.has(s.group)) groups.set(s.group, [])
      groups.get(s.group).push(s)
    }
    const { placed, sectors } = arsenalLayout(groups)
    const colorOf = new Map(sectors.map((sec, i) => [sec.group, CLUSTER_PALETTE[i % CLUSTER_PALETTE.length]]))
    // parent = nearest-angle node one arc inward (or the core for arc 0)
    const edges = placed.map((p) => {
      if (p.arc === 0) return { id: p.id, from: { x: 0, y: 0 }, to: p }
      const inward = placed.filter((q) => q.skill.group === p.skill.group && q.arc === p.arc - 1)
      let best = inward[0]
      for (const q of inward) {
        if (Math.abs(q.angle - p.angle) < Math.abs((best?.angle ?? 1e9) - p.angle)) best = q
      }
      return { id: p.id, from: best || { x: 0, y: 0 }, to: p }
    })
    return { placed, sectors, edges, colorOf }
  }, [arsenal])

  if (!layout) {
    return (
      <div className="arsenal-empty u-label">
        NO CLAUDE SKILLS DETECTED · ~/.claude/skills
      </div>
    )
  }

  const edgePath = ({ from, to }) => {
    const mx = (from.x + to.x) / 2
    const my = (from.y + to.y) / 2
    const cx = mx - (to.y - from.y) * 0.12
    const cy = my + (to.x - from.x) * 0.12
    return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`
  }

  return (
    <svg className="skills-svg" viewBox="-620 -540 1240 1080">
      {layout.edges.map((e) => {
        const col = layout.colorOf.get(e.to.skill.group)
        return (
          <g key={e.id}>
            <path d={edgePath(e)} fill="none" stroke={col} strokeOpacity="0.35" strokeWidth="1.2" />
            <circle r="2" fill={col}>
              <animateMotion dur="3.4s" repeatCount="indefinite" path={edgePath(e)} begin={`${(hashAngle(e.id) / (Math.PI * 2)) * 3.4}s`} />
            </circle>
          </g>
        )
      })}
      <g className="st-core">
        <circle r="26" fill="var(--card)" stroke="rgba(255,255,255,0.14)" />
        <circle r="32" fill="none" stroke="var(--accent)" strokeOpacity="0.4" strokeDasharray="1 3" className="st-spin" />
        <text y="-2" textAnchor="middle" className="st-lvl num">{arsenal.skills.length}</text>
        <text y="12" textAnchor="middle" className="st-lvl-cap">SKILLS</text>
      </g>
      {layout.placed.map((p) => {
        const col = layout.colorOf.get(p.skill.group)
        return (
          <g
            key={p.id}
            transform={`translate(${p.x} ${p.y})`}
            className="st-node unlocked"
            onMouseEnter={(e) => onHover({ arsenalSkill: p.skill, color: col, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onHover(null)}
          >
            <circle r="13" fill={col} opacity="0.14" />
            <circle r="7" fill={col} stroke={col} />
            <text y="20" textAnchor="middle" className="st-name" fill="var(--text)">
              {displayName(p.skill)}
            </text>
          </g>
        )
      })}
      {layout.sectors.map((sec) => {
        const [x, y] = polar(sec.mid, 470)
        return (
          <text key={sec.group} x={x} y={y} textAnchor="middle" className="st-branch" fill={layout.colorOf.get(sec.group)}>
            {sec.group} · {sec.count}
          </text>
        )
      })}
    </svg>
  )
}

export function SkillsMode({ evaluated }) {
  const [hover, setHover] = useState(null) // { skill | arsenalSkill, x, y }
  const [tab, setTab] = useState('cortex')
  const [arsenal, setArsenal] = useState(null)
  useEffect(() => {
    window.onyx.getInstalledSkills?.().then(setArsenal)
  }, [])
  const layout = useMemo(() => {
    const nodes = new Map()
    for (const s of evaluated.skills) {
      const bi = BRANCH_ORDER.indexOf(s.branch)
      const base = -90 + bi * (360 / 7)
      const jitter = (hashAngle(s.id) / (Math.PI * 2) - 0.5) * 12.6
      const r = 95 + (s.tier - 1) * 82
      const [x, y] = polar(base + jitter, r)
      nodes.set(s.id, { x, y, s })
    }
    const edges = []
    for (const s of evaluated.skills) {
      const to = nodes.get(s.id)
      const from = s.tier === 1 ? { x: 0, y: 0 } : nodes.get(`${s.branch.toLowerCase()}-${s.tier - 1}`)
      if (from && to) edges.push({ id: s.id, from, to, s })
    }
    const branchLabels = BRANCH_ORDER.map((b, i) => {
      const [x, y] = polar(-90 + i * (360 / 7), 470)
      return { b, x, y, dormant: b === 'INTELLIGENCE' }
    })
    return { nodes: [...nodes.values()], edges, branchLabels }
  }, [evaluated])

  const edgePath = ({ from, to }) => {
    const mx = (from.x + to.x) / 2
    const my = (from.y + to.y) / 2
    const bend = 0.12
    const cx = mx - (to.y - from.y) * bend
    const cy = my + (to.x - from.x) * bend
    return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`
  }

  const stateColor = (s) => (s.state === 'dormant' ? DORMANT : BRANCH_COLORS[s.branch])

  return (
    <div className="mode-scrim skills-scrim" onMouseMove={(e) => hover && setHover({ ...hover, x: e.clientX, y: e.clientY })}>
      <div className="skills-head">
        <span className="skills-tabs">
          <button className={`u-label sk-tab${tab === 'cortex' ? ' on' : ''}`} onClick={() => setTab('cortex')}>
            CORTEX
          </button>
          <button className={`u-label sk-tab${tab === 'arsenal' ? ' on' : ''}`} onClick={() => setTab('arsenal')}>
            ARSENAL{arsenal?.skills?.length ? ` · ${arsenal.skills.length}` : ''}
          </button>
        </span>
        <div className="skills-xp">
          <span className="num">
            {tab === 'cortex'
              ? `${evaluated.xp.toLocaleString()} XP · LV ${evaluated.level} ${evaluated.title} · ${evaluated.unlockedCount}/${evaluated.totalCount} UNLOCKED`
              : `${arsenal?.skills?.length || 0} CLAUDE SKILLS INSTALLED ON THIS MACHINE`}
          </span>
          <span className="rule-progress">
            <i style={{ width: tab === 'cortex' ? `${Math.round(evaluated.levelPct * 100)}%` : '100%' }} />
          </span>
        </div>
      </div>
      {tab === 'arsenal' && <Arsenal arsenal={arsenal} onHover={setHover} />}
      {tab === 'cortex' && (
      <svg className="skills-svg" viewBox="-620 -540 1240 1080">
        {/* edges */}
        {layout.edges.map((e) => {
          const unlocked = e.s.unlocked
          const col = stateColor(e.s)
          return (
            <g key={e.id}>
              <path
                d={edgePath(e)}
                fill="none"
                stroke={unlocked ? col : 'rgba(110,168,255,0.10)'}
                strokeOpacity={unlocked ? 0.5 : 1}
                strokeWidth={unlocked ? 1.4 : 1}
                strokeDasharray={e.s.state === 'dormant' ? '3 3' : undefined}
              />
              {unlocked && (
                <circle r="2" fill={col}>
                  <animateMotion
                    dur="3s"
                    repeatCount="indefinite"
                    path={edgePath(e)}
                    begin={`${(hashAngle(e.id) / (Math.PI * 2)) * 3}s`}
                  />
                </circle>
              )}
            </g>
          )
        })}
        {/* core */}
        <g className="st-core">
          <circle r="26" fill="var(--card)" stroke="rgba(255,255,255,0.14)" />
          <circle r="32" fill="none" stroke="var(--accent)" strokeOpacity="0.4" strokeDasharray="1 3" className="st-spin" />
          <text y="-2" textAnchor="middle" className="st-lvl num">{evaluated.level}</text>
          <text y="12" textAnchor="middle" className="st-lvl-cap">LV</text>
        </g>
        {/* nodes */}
        {layout.nodes.map(({ x, y, s }) => {
          const col = stateColor(s)
          const r = s.unlocked ? 9 : s.state === 'unlockable' ? 8 : 7
          return (
            <g
              key={s.id}
              transform={`translate(${x} ${y})`}
              className={`st-node ${s.state}`}
              onMouseEnter={(e) => setHover({ skill: s, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            >
              {s.unlocked && <circle r={r + 6} fill={col} opacity="0.14" />}
              {s.state === 'unlockable' && <circle r={r + 5} fill="none" stroke={col} strokeOpacity="0.5" className="st-pulse" />}
              <circle
                r={r}
                fill={s.unlocked ? col : 'var(--card)'}
                stroke={col}
                strokeOpacity={s.unlocked ? 1 : 0.55}
                strokeDasharray={s.state === 'dormant' ? '3 3' : undefined}
              />
              {s.state === 'dormant' && <text y="3" textAnchor="middle" className="st-lock">🔒</text>}
              <text y={r + 13} textAnchor="middle" className="st-name" fill={s.unlocked ? 'var(--text)' : 'var(--text-faint)'}>
                {s.name}
              </text>
            </g>
          )
        })}
        {/* branch labels */}
        {layout.branchLabels.map(({ b, x, y, dormant }) => (
          <text
            key={b}
            x={x}
            y={y}
            textAnchor="middle"
            className="st-branch"
            fill={dormant ? DORMANT : BRANCH_COLORS[b]}
          >
            {b}
            {dormant ? ' · LOCKED' : ''}
          </text>
        ))}
      </svg>
      )}

      {hover && hover.arsenalSkill && (
        <div
          className="skillcard glass"
          style={{
            left: Math.min(hover.x + 16, window.innerWidth - 300),
            top: Math.min(hover.y + 12, window.innerHeight - 220)
          }}
        >
          <div className="sk-name" style={{ color: hover.color }}>{hover.arsenalSkill.name}</div>
          <div className="u-label">
            {hover.arsenalSkill.group} ·{' '}
            {hover.arsenalSkill.source === 'plugin' ? `PLUGIN v${hover.arsenalSkill.version}` : 'USER SKILL'}
          </div>
          {hover.arsenalSkill.blurb && <div className="sk-flavor">“{hover.arsenalSkill.blurb}”</div>}
        </div>
      )}

      {hover && hover.skill && (
        <div
          className="skillcard glass"
          style={{
            left: Math.min(hover.x + 16, window.innerWidth - 300),
            top: Math.min(hover.y + 12, window.innerHeight - 220)
          }}
        >
          <div className="sk-name" style={{ color: stateColor(hover.skill) }}>{hover.skill.name}</div>
          <div className="u-label">{hover.skill.branch} · TIER {ROMAN[hover.skill.tier - 1] || hover.skill.tier}</div>
          <div className="sk-flavor">“{hover.skill.flavor}”</div>
          {hover.skill.parts.map((p) => (
            <div key={p.label} className="sk-part">
              <span className="sk-part-label">{p.label}</span>
              <span className="bar"><i style={{ width: `${p.progress * 100}%`, background: stateColor(hover.skill) }} /></span>
              <span className="num sk-part-val">
                {p.done ? '✓' : `${Math.round(p.value).toLocaleString()} / ${p.target.toLocaleString()}`}
              </span>
            </div>
          ))}
          {hover.skill.state === 'dormant' && (
            <div className="sk-gate">Requires Knowledge Engine (Claude API key)</div>
          )}
        </div>
      )}
    </div>
  )
}
