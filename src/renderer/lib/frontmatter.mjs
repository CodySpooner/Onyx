// Surgical frontmatter edits on RAW text — never re-serializes YAML, so
// comments, ordering, and formatting survive byte-for-byte outside the one
// changed line. Trust boundary: throws rather than risking corruption.
const BLOCK_RE = /^---(\r?\n)([\s\S]*?)\r?\n---(\r?\n|$)/

export function setFrontmatterKey(raw, key, value) {
  if (typeof value === 'string' && /[\r\n]/.test(value)) {
    throw new Error('setFrontmatterKey: newline-bearing values are not supported')
  }
  if (value !== true && value !== false && typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('setFrontmatterKey: scalar values only')
  }
  const text = String(raw)
  const line = `${key}: ${value}`
  const m = text.match(BLOCK_RE)

  if (!m) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    return `---${eol}${line}${eol}---${eol}` + text
  }

  const eol = m[1]
  const block = m[2]
  const keyRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*:.*$`, 'm')
  let nextBlock
  if (keyRe.test(block)) {
    nextBlock = block.replace(keyRe, line)
  } else {
    nextBlock = block + eol + line
  }
  return text.slice(0, m.index) + `---${eol}${nextBlock}${eol}---${m[3]}` + text.slice(m.index + m[0].length)
}
