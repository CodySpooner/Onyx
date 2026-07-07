// BROWSE tab data + pure logic. The catalog is CURATED and honest: every
// entry is a real project as of Jan 2026 knowledge; anything unvouched
// carries uncertain:true and renders an UNVERIFIED chip. Discovery only —
// the app never installs anything; install commands go to the clipboard.

export const CATALOG = [
  // ── official ──
  { id: 'anthropics-skills', name: 'anthropics/skills', kind: 'skill', repo: 'anthropics/skills', url: 'https://github.com/anthropics/skills', description: 'Official Agent Skills: document editing (docx/pdf/pptx/xlsx), MCP builder, artifacts, webapp testing.', install: 'git clone https://github.com/anthropics/skills', tags: ['docs', 'automation', 'productivity'], tier: 'essential' },
  { id: 'claude-code-marketplace', name: 'anthropics plugin marketplace', kind: 'marketplace', repo: 'anthropics/claude-code', url: 'https://github.com/anthropics/claude-code', description: 'The official Claude Code plugin marketplace.', install: '/plugin marketplace add anthropics/claude-code', tags: ['workflow', 'productivity'], tier: 'essential', uncertain: true },
  { id: 'security-review', name: 'claude-code-security-review', kind: 'tool', repo: 'anthropics/claude-code-security-review', url: 'https://github.com/anthropics/claude-code-security-review', description: 'Official AI security reviewer for your diffs and PRs.', install: '/plugin install security-review', tags: ['security', 'ci', 'testing'], tier: 'popular' },
  // ── community ──
  { id: 'superpowers', name: 'superpowers', kind: 'plugin', repo: 'obra/superpowers', url: 'https://github.com/obra/superpowers', description: 'Process skills: brainstorming, TDD, systematic debugging, plans, worktrees — the engineering discipline pack.', install: '/plugin marketplace add obra/superpowers-marketplace && /plugin install superpowers', tags: ['workflow', 'testing', 'debugging', 'productivity'], tier: 'essential' },
  { id: 'awesome-claude-code', name: 'awesome-claude-code', kind: 'marketplace', repo: 'hesreallyhim/awesome-claude-code', url: 'https://github.com/hesreallyhim/awesome-claude-code', description: 'The big curated list of commands, workflows and resources for Claude Code.', install: 'browse the list — copy what fits', tags: ['workflow', 'docs', 'research'], tier: 'essential' },
  { id: 'claude-code-templates', name: 'claude-code-templates', kind: 'tool', repo: 'davila7/claude-code-templates', url: 'https://github.com/davila7/claude-code-templates', description: 'CLI to browse and install community agents, commands and MCPs (aitmpl.com).', install: 'npx claude-code-templates@latest', tags: ['agents', 'automation', 'mcp'], tier: 'popular' },
  { id: 'wshobson-agents', name: 'wshobson/agents', kind: 'skill', repo: 'wshobson/agents', url: 'https://github.com/wshobson/agents', description: 'Large collection of production-grade subagent definitions by specialty.', install: 'git clone https://github.com/wshobson/agents', tags: ['agents', 'workflow'], tier: 'popular' },
  { id: 'ccplugins', name: 'CCPlugins', kind: 'plugin', repo: 'brennercruvinel/CCPlugins', url: 'https://github.com/brennercruvinel/CCPlugins', description: 'Command pack: cleanup, review, commit hygiene, session management.', install: 'see repo README', tags: ['git', 'workflow', 'productivity'], tier: 'popular', uncertain: true },
  { id: 'superclaude', name: 'SuperClaude Framework', kind: 'plugin', repo: 'SuperClaude-Org/SuperClaude_Framework', url: 'https://github.com/SuperClaude-Org/SuperClaude_Framework', description: 'Big framework of personas, commands and MCP wiring for Claude Code.', install: 'see repo README', tags: ['agents', 'workflow', 'mcp'], tier: 'popular', uncertain: true },
  { id: 'claude-flow', name: 'claude-flow', kind: 'tool', repo: 'ruvnet/claude-flow', url: 'https://github.com/ruvnet/claude-flow', description: 'Multi-agent orchestration platform: swarms, pipelines, memory.', install: 'npx claude-flow', tags: ['agents', 'automation', 'workflow'], tier: 'popular', uncertain: true },
  { id: 'spec-workflow', name: 'claude-code-spec-workflow', kind: 'plugin', repo: 'Pimzino/claude-code-spec-workflow', url: 'https://github.com/Pimzino/claude-code-spec-workflow', description: 'Spec-driven development: requirements → design → tasks → implementation.', install: 'see repo README', tags: ['workflow', 'docs'], tier: 'niche', uncertain: true },
  { id: 'hooks-mastery', name: 'claude-code-hooks-mastery', kind: 'skill', repo: 'disler/claude-code-hooks-mastery', url: 'https://github.com/disler/claude-code-hooks-mastery', description: 'Every Claude Code hook with worked examples — the hooks cookbook.', install: 'git clone https://github.com/disler/claude-code-hooks-mastery', tags: ['automation', 'workflow'], tier: 'niche' },
  { id: 'claude-router', name: 'claude-code-router', kind: 'tool', repo: 'musistudio/claude-code-router', url: 'https://github.com/musistudio/claude-code-router', description: 'Route Claude Code requests across different model backends.', install: 'npm i -g @musistudio/claude-code-router', tags: ['automation'], tier: 'niche', uncertain: true },
  { id: 'claude-docs', name: 'claude-code-docs', kind: 'skill', repo: 'ericbuess/claude-code-docs', url: 'https://github.com/ericbuess/claude-code-docs', description: 'Local mirror of Claude Code docs for offline lookup by agents.', install: 'git clone https://github.com/ericbuess/claude-code-docs', tags: ['docs', 'research'], tier: 'niche' },
  { id: 'claudia', name: 'claudia (GUI)', kind: 'tool', repo: 'getAsterisk/claudia', url: 'https://github.com/getAsterisk/claudia', description: 'Desktop GUI for Claude Code sessions, agents and usage analytics.', install: 'see repo releases', tags: ['productivity', 'ui'], tier: 'popular', uncertain: true },
  { id: 'subagents-collection', name: 'awesome-claude-code-subagents', kind: 'skill', repo: 'VoltAgent/awesome-claude-code-subagents', url: 'https://github.com/VoltAgent/awesome-claude-code-subagents', description: 'Curated subagent library across engineering roles.', install: 'git clone https://github.com/VoltAgent/awesome-claude-code-subagents', tags: ['agents'], tier: 'niche', uncertain: true },
  // ── PKM / vault adjacent ──
  { id: 'claude-obsidian', name: 'claude-obsidian wiki pack', kind: 'plugin', repo: 'agricidaniel/claude-obsidian', url: 'https://github.com/agricidaniel/claude-obsidian', description: 'Obsidian vault ingestion, wiki maintenance and lint skills (you run this one).', install: '/plugin install claude-obsidian', tags: ['obsidian', 'pkm', 'writing'], tier: 'popular', uncertain: true },
  { id: 'onyx-bridge', name: 'onyx-bridge', kind: 'skill', repo: null, url: 'https://github.com/CodySpooner/Onyx', description: 'THIS vault: Claude sessions log project state to Claude Projects/ and never redo finished steps.', install: 'installed with Onyx', tags: ['pkm', 'agents', 'productivity'], tier: 'essential' }
]

export const TAG_VOCAB = ['agents', 'automation', 'betting', 'ci', 'debugging', 'design', 'docs', 'git', 'mcp', 'obsidian', 'pkm', 'productivity', 'research', 'security', 'sports', 'testing', 'ui', 'workflow', 'writing']

export function searchCatalog(entries, q) {
  if (!q) return entries
  const n = q.toLowerCase()
  return entries.filter((e) => (e.name + ' ' + e.description + ' ' + e.tags.join(' ')).toLowerCase().includes(n))
}

const norm = (s) => String(s || '').toLowerCase().replace(/^claude-/, '')

// cross-reference against the live ARSENAL scan → .installed flags
export function markInstalled(entries, arsenalSkills = []) {
  const names = new Set()
  for (const s of arsenalSkills) {
    names.add(norm(s.name))
    if (s.plugin) names.add(norm(s.plugin))
  }
  return entries.map((e) => {
    const keys = [norm(e.name), norm(e.repo ? e.repo.split('/')[1] : ''), norm(e.id)]
    return { ...e, installed: keys.some((k) => k && names.has(k)) }
  })
}

export function vaultTopTags(notes, n = 10) {
  const m = new Map()
  for (const note of notes) {
    for (const t of note.tags || []) {
      const k = t.toLowerCase()
      m.set(k, (m.get(k) || 0) + 1)
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t)
}

const ALIAS = { bet: 'betting', bets: 'betting', betting: 'betting', projection: 'betting', odds: 'betting', esports: 'sports', esport: 'sports', note: 'pkm', notes: 'pkm', obsidian: 'obsidian', vault: 'pkm', model: 'research', models: 'research', analytics: 'research', api: 'automation', app: 'ui', backend: 'automation', architecture: 'design', auth: 'security', test: 'testing', backtest: 'research' }

export function fitScore(entry, topTags) {
  const expanded = new Set()
  for (const t of topTags) {
    expanded.add(t)
    if (ALIAS[t]) expanded.add(ALIAS[t])
  }
  return entry.tags.filter((t) => expanded.has(t)).length
}

// merge live GitHub repos (optional layer) as popular-tier cards
export function mergeLive(catalog, repos) {
  if (!repos?.length) return catalog
  const known = new Set(catalog.map((e) => (e.repo || '').toLowerCase()))
  const extra = repos
    .filter((r) => r.full_name && !known.has(r.full_name.toLowerCase()))
    .slice(0, 30)
    .map((r) => ({
      id: 'live-' + r.full_name,
      name: r.name,
      kind: (r.topics || []).includes('claude-code-plugin') ? 'plugin' : 'skill',
      repo: r.full_name,
      url: r.html_url,
      description: (r.description || '').slice(0, 200),
      install: 'see repo README',
      tags: (r.topics || []).filter((t) => TAG_VOCAB.includes(t)).slice(0, 5),
      tier: 'popular',
      stars: r.stargazers_count,
      live: true
    }))
  return [...catalog, ...extra]
}
