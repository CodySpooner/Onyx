import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import { scanVault, readNoteRaw, writeNoteRaw } from './vault-indexer.mjs'
import { loadConfig, saveConfig } from './config.js'
import { setupUpdater, installUpdate } from './updater.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let win
let watcher
let cachedGraph = null

async function reindex() {
  const { vaultPath } = loadConfig()
  if (!vaultPath) {
    cachedGraph = null
    return null
  }
  try {
    cachedGraph = await scanVault(vaultPath)
  } catch {
    cachedGraph = null
  }
  return cachedGraph
}

function watchVault() {
  const { vaultPath } = loadConfig()
  watcher?.close()
  watcher = null
  if (!vaultPath) return
  let t
  watcher = chokidar.watch(vaultPath, { ignoreInitial: true, ignored: /(^|[/\\])\../ })
  const bump = () => {
    clearTimeout(t)
    t = setTimeout(async () => {
      const g = await reindex()
      if (g) win?.webContents.send('vault:update', g)
    }, 300)
  }
  watcher.on('add', bump).on('change', bump).on('unlink', bump)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#05060a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
  if (process.env.ONYX_SHOT) {
    win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg))
    captureAndQuit(win)
  }
}

// ponytail: env-gated one-shot screenshot for automated visual verification.
// ONYX_SHOT=<png path>, optional ONYX_SHOT_DELAY=<ms>, optional ONYX_SHOT_JS=<js file
// run in the renderer before capture>. No-op in normal runs.
function captureAndQuit(target) {
  target.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const { readFileSync, writeFileSync } = await import('node:fs')
        if (process.env.ONYX_SHOT_JS) {
          await target.webContents.executeJavaScript(readFileSync(process.env.ONYX_SHOT_JS, 'utf8'))
          await new Promise((r) => setTimeout(r, 700)) // let the UI react
        }
        const img = await target.webContents.capturePage()
        writeFileSync(process.env.ONYX_SHOT, img.toPNG())
      } catch (e) {
        console.error('ONYX_SHOT capture failed:', e)
      }
      app.quit()
    }, Number(process.env.ONYX_SHOT_DELAY || 3500))
  })
}

ipcMain.handle('vault:getGraph', async () => cachedGraph ?? (await reindex()))
ipcMain.handle('vault:readNote', async (_e, id) => {
  const { vaultPath } = loadConfig()
  try {
    return await readNoteRaw(vaultPath, id)
  } catch {
    return null
  }
})
ipcMain.handle('vault:writeNote', async (_e, id, content) => {
  const { vaultPath } = loadConfig()
  try {
    await writeNoteRaw(vaultPath, id, content)
    return true
  } catch (e) {
    console.error('writeNote failed:', e)
    return false
  }
})
ipcMain.handle('config:get', () => loadConfig())
ipcMain.handle('config:set', (_e, patch) => saveConfig(patch))
ipcMain.handle('update:install', () => installUpdate())
ipcMain.handle('vault:pickVault', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (r.canceled || !r.filePaths[0]) return cachedGraph
  saveConfig({ vaultPath: r.filePaths[0] })
  const g = await reindex()
  watchVault()
  return g
})

app.whenReady().then(async () => {
  createWindow()
  await reindex()
  watchVault()
  setupUpdater(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
