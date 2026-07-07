import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// vaultPath intentionally empty by default: fresh installs route to the
// vault picker instead of scanning a path that only exists on one machine.
const DEFAULTS = {
  vaultPath: '',
  sizeBy: 'links',
  colorBy: 'folder',
  showAllLinks: true,
  showLabels: false,
  pins: [],
  dailyFolder: '06 - Daily Logs'
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
