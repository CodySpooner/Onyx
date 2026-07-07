import { useEffect, useMemo, useState } from 'react'
import { hashAngle } from '../lib/graph.mjs'
import { BRANCH_COLORS } from '../lib/skills.mjs'
import { CLUSTER_PALETTE } from '../lib/clusters.mjs'
import { arsenalLayout, displayName } from '../lib/installed-skills.mjs'
import { questValue } from '../lib/quests.mjs'
import { BrowseSkills } from '../components/BrowseSkills.jsx'

const BRANCH_ORDER = ['INTELLIGENCE', 'MEMORY', 'ARCHITECT', 'CARTOGRAPHER', 'RITUALIST', 'CURATOR', 'EXPLORER']
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const DORMANT = '#565f7d'

// what each branch is FOR — shown in the click-detail panel
const BRANCH_USES = {
  MEMORY: 'Raw capture volume. Every note and word you bank grows this branch — use it to gauge whether the vault is actually absorbing your research.',
  ARCHITECT: 'Connection density. Grows when you wire notes together with [[wikilinks]] — the difference between a pile of files and a brain.',
  CARTOGRAPHER: 'Structure awareness. Clusters and bridge notes — use it to see whether your betting systems form real territories or one blob.',
  RITUALIST: 'Consistency. Streaks and daily habits — the compounding-interest branch.',
  CURATOR: 'Maintenance. Reviews, triage, pruning — keeps the brain trustworthy.',
  EXPLORER: 'Navigation. Searching, hopping views, revisiting cold notes — how well you traverse what you built.',
  INTELLIGENCE: 'AI enrichment. Activates when a Claude API key is connected — summaries, ghost links, chat over the vault.'
}

function polar(angleDeg, r) {
  const a = (angleDeg * Math.PI) / 180
  return [Math.cos(a) * r, Math.sin(a) * r]
}

// The machine's real installed Claude skills, as a constellation of their own.
function Arsenal({ arsenal, onHover, onDetail, viewBox }) {
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
    <svg className="skills-svg" viewBox={viewBox || '-620 -540 1240 1080'}>
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
            onClick={() => onDetail?.(p.skill, col)}
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

export function SkillsMode({ evaluated, quests, usage, onReroll, notes = [] }) {
  const [hover, setHover] = useState(null) // { skill | arsenalSkill, x, y }
  const [tab, setTab] = useState('cortex')
  const [arsenal, setArsenal] = useState(null)
  const [detail, setDetail] = useState(null) // { skill } | { arsenalSkill, color }
  const [zoom, setZoom] = useState(1)
  // live ARSENAL: rescan on mount, on tab switch, and every 60s — newly
  // installed Claude skills appear without restarting Onyx
  useEffect(() => {
    const scan = () => window.onyx.getInstalledSkills?.().then(setArsenal)
    scan()
    const t = setInterval(scan, 60000)
    return () => clearInterval(t)
  }, [tab])
  const onWheel = (e) => {
    setZoom((z) => Math.max(0.45, Math.min(2.4, e.deltaY > 0 ? z * 1.12 : z / 1.12)))
  }
  const viewBox = `${-620 * zoom} ${-540 * zoom} ${1240 * zoom} ${1080 * zoom}`
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
          <button className={`u-label sk-tab${tab === 'quests' ? ' on' : ''}`} onClick={() => setTab('quests')}>
            QUESTS{quests ? ` · ${quests.daily.filter((q) => q.done).length + quests.weekly.filter((q) => q.done).length}/${quests.daily.length + quests.weekly.length}` : ''}
          </button>
          <button className={`u-label sk-tab${tab === 'browse' ? ' on' : ''}`} onClick={() => setTab('browse')}>
            BROWSE
          </button>
        </span>
        <div className="skills-xp">
          <span className="num">
            {tab === 'cortex'
              ? `${evaluated.xp.toLocaleString()} XP · LV ${evaluated.level} ${evaluated.title} · ${evaluated.unlockedCount}/${evaluated.totalCount} UNLOCKED`
              : tab === 'quests'
                ? `DAILY + WEEKLY GOALS · QUEST XP FEEDS YOUR REAL LEVEL`
                : tab === 'browse'
                  ? 'DISCOVERY ONLY · INSTALL FROM YOUR TERMINAL · NEVER AUTO-INSTALLS'
                  : `${arsenal?.skills?.length || 0} CLAUDE SKILLS INSTALLED ON THIS MACHINE · AUTO-REFRESHES`}
          </span>
          <span className="rule-progress">
            <i style={{ width: tab === 'cortex' ? `${Math.round(evaluated.levelPct * 100)}%` : '100%' }} />
          </span>
        </div>
      </div>
      {tab === 'arsenal' && (
        <div className="skills-stage" onWheel={onWheel}>
          <Arsenal arsenal={arsenal} onHover={setHover} viewBox={viewBox} onDetail={(s, c) => setDetail({ arsenalSkill: s, color: c })} />
        </div>
      )}
      {tab === 'browse' && <BrowseSkills arsenal={arsenal} notes={notes} />}
      {tab === 'quests' && quests && (
        <div className="quests-wrap">
          <div className="quests-col">
            <div className="u-label">DAILY · RESETS AT MIDNIGHT</div>
            <div className="rule-ticks" />
            {quests.daily.map((q) => {
              const v = Math.min(q.target, questValue(q, usage, quests.weekStart))
              return (
                <div key={q.id} className={`quest brk${q.done ? ' done' : ''}`}>
                  <div className="q-top">
                    <span className="q-label">{q.done ? '✓ ' : ''}{q.label}</span>
                    <span className="q-xp num">+{q.xp} XP</span>
                  </div>
                  <div className="q-row">
                    <span className="bar"><i style={{ width: `${(v / q.target) * 100}%` }} /></span>
                    <span className="num q-val">{v}/{q.target}</span>
                    {!q.done && quests.rerolledOn !== quests.day && (
                      <button className="q-reroll" data-tip="Reroll (once per day)" onClick={() => onReroll(q.id)}>⟲</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="quests-col">
            <div className="u-label">WEEKLY · RESETS MONDAY</div>
            <div className="rule-ticks" />
            {quests.weekly.map((q) => {
              const v = Math.min(q.target, questValue(q, usage, quests.weekStart))
              return (
                <div key={q.id} className={`quest brk${q.done ? ' done' : ''}`}>
                  <div className="q-top">
                    <span className="q-label">{q.done ? '✓ ' : ''}{q.label}</span>
                    <span className="q-xp num">+{q.xp} XP</span>
                  </div>
                  <div className="q-row">
                    <span className="bar"><i style={{ width: `${(v / q.target) * 100}%` }} /></span>
                    <span className="num q-val">{v}/{q.target}</span>
                  </div>
                </div>
              )
            })}
            <div className="quest-total u-label">LIFETIME QUEST XP · <span className="num">{quests.bonusXp || 0}</span></div>
          </div>
        </div>
      )}
      {tab === 'cortex' && (
      <div className="skills-stage" onWheel={onWheel}>
      <svg className="skills-svg" viewBox={viewBox}>
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
              onClick={() => setDetail({ skill: s })}
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
      </div>
      )}

      {detail && (
        <div className="skdetail glass brk">
          <button className="skd-close" onClick={() => setDetail(null)}>✕</button>
          {detail.skill ? (
            <>
              <div className="sk-name" style={{ color: stateColor(detail.skill) }}>{detail.skill.name}</div>
              <div className="u-label">
                {detail.skill.branch} · TIER {ROMAN[detail.skill.tier - 1] || detail.skill.tier} ·{' '}
                {detail.skill.unlocked ? 'UNLOCKED' : detail.skill.state === 'dormant' ? 'LOCKED' : 'IN PROGRESS'}
              </div>
              <div className="sk-flavor">“{detail.skill.flavor}”</div>
              <div className="skd-sec u-label">WHAT THIS BRANCH MEASURES</div>
              <p className="skd-text">{BRANCH_USES[detail.skill.branch]}</p>
              <div className="skd-sec u-label">HOW TO EARN IT</div>
              {detail.skill.parts.map((p) => (
                <div key={p.label} className="sk-part">
                  <span className="sk-part-label">{p.label}</span>
                  <span className="bar"><i style={{ width: `${p.progress * 100}%`, background: stateColor(detail.skill) }} /></span>
                  <span className="num sk-part-val">
                    {p.done ? '✓' : `${Math.round(p.value).toLocaleString()} / ${p.target.toLocaleString()}`}
                  </span>
                </div>
              ))}
              {detail.skill.state === 'dormant' && <div className="sk-gate">Requires Knowledge Engine (Claude API key)</div>}
            </>
          ) : (
            <>
              <div className="sk-name" style={{ color: detail.color }}>{detail.arsenalSkill.name}</div>
              <div className="u-label">
                {detail.arsenalSkill.group} ·{' '}
                {detail.arsenalSkill.source === 'plugin' ? `PLUGIN v${detail.arsenalSkill.version}` : 'USER SKILL'}
              </div>
              <div className="skd-sec u-label">WHAT IT DOES</div>
              <p className="skd-text">{detail.arsenalSkill.description || detail.arsenalSkill.blurb || 'No description in this SKILL.md.'}</p>
              <div className="skd-sec u-label">USE IT</div>
              <p className="skd-text">
                Invoke from Claude Code{detail.arsenalSkill.source === 'user' ? ` with /${detail.arsenalSkill.name}` : ''} — installed at{' '}
                {detail.arsenalSkill.source === 'plugin' ? `plugins/${detail.arsenalSkill.plugin}` : '~/.claude/skills'}.
              </p>
            </>
          )}
        </div>
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
