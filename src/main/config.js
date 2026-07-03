import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DEFAULTS = {
  vaultPath: 'C:\\Users\\Xody2\\OneDrive\\Desktop\\Xody Bets Website Vault',
  sizeBy: 'links',
  colorBy: 'folder',
  showAllLinks: true,
  showLabels: false
}

const file = () => path.join(app.getPath('userData'), 'onyx-config.json')

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch }
  writeFileSync(file(), JSON.stringify(next, null, 2))
  return next
}
