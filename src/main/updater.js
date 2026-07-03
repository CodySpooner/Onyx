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
  setInterval(check, 3 * 60 * 60 * 1000) // re-check every 3 hours
}

export function installUpdate() {
  autoUpdater.quitAndInstall()
}
