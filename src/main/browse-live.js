// Optional live layer for the BROWSE tab: two GitHub topic searches per 24h,
// cached via the generic store, degrading to stale cache (or null) on ANY
// failure. Runs in MAIN on purpose — the renderer never touches the network.
// HONESTY: there is no public Claude plugin registry endpoint as of Jan 2026;
// marketplaces are git repos. If Anthropic ships a registry, swap these two
// URLs — cache shape and UI stay identical.
import { storeGet, storeSet } from './store.js'

const TTL = 24 * 3600 * 1000
const QUERIES = [
  'https://api.github.com/search/repositories?q=topic%3Aclaude-code-plugin&sort=stars&order=desc&per_page=30',
  'https://api.github.com/search/repositories?q=topic%3Aclaude-code-skills&sort=stars&order=desc&per_page=30'
]

export async function fetchBrowseLive() {
  const cache = storeGet('browse-cache')
  if (cache?.fetchedAt && Date.now() - cache.fetchedAt < TTL) return cache
  try {
    const seen = new Map()
    for (const url of QUERIES) {
      const res = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'onyx-browse' },
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) throw new Error('github ' + res.status)
      const data = await res.json()
      for (const r of data.items || []) {
        if (!seen.has(r.full_name)) {
          seen.set(r.full_name, {
            full_name: r.full_name,
            name: r.name,
            description: r.description,
            html_url: r.html_url,
            stargazers_count: r.stargazers_count,
            topics: (r.topics || []).slice(0, 8),
            pushed_at: r.pushed_at
          })
        }
      }
    }
    const payload = { fetchedAt: Date.now(), repos: [...seen.values()].slice(0, 50) }
    storeSet('browse-cache', payload)
    return payload
  } catch (e) {
    console.error('browse-live fetch failed:', e?.message || e)
    return cache?.repos ? cache : null // stale beats nothing; null beats lying
  }
}
