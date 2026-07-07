import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import { scanVault, readNoteRaw, writeNoteRaw, createNote, deleteNote, renameNote, ensureNote } from './vault-indexer.mjs'
import { loadConfig, saveConfig } from './config.js'
import { setupUpdater, installUpdate, checkUpdatesNow } from './updater.js'
import { loadUsage, bumpUsage, markUnlocked, loadSnapshots, recordSnapshot, flush } from './appdata.js'
import { scanInstalledSkills } from './claude-skills.js'
import { fetchBrowseLive } from './browse-live.js'
import { storeGet, storeSet } from './store.js'

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
  if (cachedGraph) {
    try {
      const d = new Date()
      recordSnapshot({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        notes: cachedGraph.meta.noteCount,
        links: cachedGraph.meta.linkCount,
        words: cachedGraph.notes.reduce((s, n) => s + (n.wordCount || 0), 0),
        orphans: cachedGraph.notes.filter((n) => !n.inLinks.length && !n.outLinks.length).length
      })
    } catch (e) {
      console.error('snapshot failed:', e)
    }
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
      bumpUsage('vaultEdit') // Obsidian edits count toward streaks too
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
    minWidth: 720,
    minHeight: 480,
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
    // don't rely on chokidar (flaky on OneDrive): reindex + broadcast now so
    // optimistic UI (pending task marks) always resolves
    const g = await reindex()
    if (g) win?.webContents.send('vault:update', g)
    return true
  } catch (e) {
    console.error('writeNote failed:', e)
    return false
  }
})
ipcMain.handle('vault:createNote', async (_e, folder, title) => {
  const { vaultPath } = loadConfig()
  try {
    return await createNote(vaultPath, folder, title)
  } catch (e) {
    console.error('createNote failed:', e)
    return null
  }
})
ipcMain.handle('vault:deleteNote', async (_e, id) => {
  const { vaultPath } = loadConfig()
  try {
    await deleteNote(vaultPath, id)
    return true
  } catch (e) {
    console.error('deleteNote failed:', e)
    return false
  }
})
ipcMain.handle('vault:renameNote', async (_e, id, title) => {
  const { vaultPath } = loadConfig()
  try {
    return await renameNote(vaultPath, id, title)
  } catch (e) {
    console.error('renameNote failed:', e)
    return null
  }
})
ipcMain.handle('config:get', () => loadConfig())
ipcMain.handle('config:set', (_e, patch) => saveConfig(patch))
ipcMain.handle('update:install', () => installUpdate())
ipcMain.handle('update:check', () => checkUpdatesNow())
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('usage:get', () => loadUsage())
ipcMain.handle('usage:bump', (_e, name, n) => bumpUsage(name, n))
ipcMain.handle('usage:markUnlocked', (_e, ids) => markUnlocked(ids))
ipcMain.handle('snapshots:get', () => loadSnapshots().days)
ipcMain.handle('skills:installed', () => scanInstalledSkills())
ipcMain.handle('browse:live', () => fetchBrowseLive())
ipcMain.handle('store:get', (_e, name) => storeGet(name))
ipcMain.handle('store:set', (_e, name, data) => storeSet(name, data))
ipcMain.handle('shell:openExternal', (_e, url) => {
  // trust boundary lives in MAIN: only http(s) ever leaves the app
  try {
    const u = new URL(String(url))
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    shell.openExternal(u.href)
    return true
  } catch {
    return false
  }
})
ipcMain.handle('vault:ensureNote', async (_e, rel, content) => {
  const { vaultPath } = loadConfig()
  try {
    return await ensureNote(vaultPath, rel, content)
  } catch (e) {
    console.error('ensureNote failed:', e)
    return null
  }
})
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

app.on('before-quit', () => flush())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
