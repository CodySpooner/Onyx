import electronUpdater from 'electron-updater'
import { app } from 'electron'

const { autoUpdater } = electronUpdater

// electron-updater reads the latest.yml electron-builder publishes to the
// GitHub Release (from the "publish" config in package.json). Only runs in a
// packaged/installed build — in dev it would throw "not packaged".
export function setupUpdater(win) {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (status, info) => {
    if (win && !win.isDestroyed()) win.webContents.send('update:status', { status, info })
  }

  autoUpdater.on('update-available', (i) => send('available', { version: i.version }))
  autoUpdater.on('update-not-available', () => send('none'))
  autoUpdater.on('download-progress', (p) => send('progress', { percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => send('ready', { version: i.version }))
  autoUpdater.on('error', (e) => send('error', { message: String(e && e.message ? e.message : e) }))

  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  // 30 min, not hours: a long-open app should never be releases behind
  setInterval(check, 30 * 60 * 1000)
}

// manual "check now" (palette) — returns a result the renderer can toast
export async function checkUpdatesNow() {
  if (!app.isPackaged) return { status: 'dev', current: app.getVersion() }
  try {
    const r = await autoUpdater.checkForUpdates()
    const current = app.getVersion()
    const next = r?.updateInfo?.version
    return { status: next && next !== current ? 'found' : 'latest', version: next, current }
  } catch (e) {
    return { status: 'error', message: String(e && e.message ? e.message : e) }
  }
}

export function installUpdate() {
  autoUpdater.quitAndInstall()
}
