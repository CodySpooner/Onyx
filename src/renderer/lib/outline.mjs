// Heading outline for the reader. ATX only (Obsidian idiom; setext headings
// intentionally unsupported). ord = nth heading in the rendered body, which
// matches querySelectorAll('h1..h6')[ord] because both sides parse the same
// post-frontmatter markdown and code-fence "headings" are skipped by both.

export const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/

export function stripFrontmatter(raw) {
  return String(raw).replace(FRONTMATTER_RE, '')
}

export function extractOutline(raw) {
  const body = stripFrontmatter(raw)
  const out = []
  let fence = false
  let ord = 0
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const m = line.match(/^(#{1,6})\s+(.*)$/)
    if (!m) continue
    const text = m[2]
      .replace(/#+\s*$/, '')
      .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/!?\[\[([^\]]+)\]\]/g, '$1')
      .replace(/[*_`]/g, '')
      .trim()
    if (text) out.push({ level: m[1].length, text, ord })
    ord++ // every ATX heading advances the rendered-heading ordinal, titled or not
  }
  return out
}
