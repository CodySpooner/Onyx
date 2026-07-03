import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let win

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
  if (process.env.ONYX_SHOT) captureAndQuit(win)
}

// ponytail: env-gated one-shot screenshot for automated visual verification.
// Set ONYX_SHOT=<png path> (and optionally ONYX_SHOT_DELAY=<ms>) to grab the
// rendered window — WebGL included — then exit. No-op in normal runs.
function captureAndQuit(win) {
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const { readFileSync, writeFileSync } = await import('node:fs')
        if (process.env.ONYX_SHOT_JS) {
          await win.webContents.executeJavaScript(readFileSync(process.env.ONYX_SHOT_JS, 'utf8'))
          await new Promise((r) => setTimeout(r, 700)) // let the UI react
        }
        const img = await win.webContents.capturePage()
        writeFileSync(process.env.ONYX_SHOT, img.toPNG())
      } catch (e) {
        console.error('ONYX_SHOT capture failed:', e)
      }
      app.quit()
    }, Number(process.env.ONYX_SHOT_DELAY || 3500))
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
