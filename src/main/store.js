// Generic named JSON stores under userData (currently only 'srs').
// Name validation is a trust boundary; writes are atomic (temp + rename).
import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'

const NAME_RE = /^[a-z][a-z0-9-]{0,32}$/

const file = (name) => path.join(app.getPath('userData'), `onyx-store-${name}.json`)

export function storeGet(name) {
  if (!NAME_RE.test(String(name))) return null
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'))
  } catch {
    return null
  }
}

export function storeSet(name, data) {
  if (!NAME_RE.test(String(name))) return false
  try {
    const p = file(name)
    const tmp = p + '.tmp'
    writeFileSync(tmp, JSON.stringify(data ?? null, null, 2))
    renameSync(tmp, p)
    return true
  } catch (e) {
    console.error('storeSet failed:', e)
    return false
  }
}
