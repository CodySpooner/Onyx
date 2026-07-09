import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('onyx', {
  getGraph: () => ipcRenderer.invoke('vault:getGraph'),
  readNote: (id) => ipcRenderer.invoke('vault:readNote', id),
  writeNote: (id, content) => ipcRenderer.invoke('vault:writeNote', id, content),
  createNote: (folder, title) => ipcRenderer.invoke('vault:createNote', folder, title),
  deleteNote: (id) => ipcRenderer.invoke('vault:deleteNote', id),
  renameNote: (id, title) => ipcRenderer.invoke('vault:renameNote', id, title),
  pickVault: () => ipcRenderer.invoke('vault:pickVault'),
  listVaults: () => ipcRenderer.invoke('vault:list'),
  switchVault: (path) => ipcRenderer.invoke('vault:switch', path),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  onGraphUpdate: (cb) => {
    const h = (_e, g) => cb(g)
    ipcRenderer.on('vault:update', h)
    return () => ipcRenderer.removeListener('vault:update', h)
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getUsage: () => ipcRenderer.invoke('usage:get'),
  bumpUsage: (name, n) => ipcRenderer.invoke('usage:bump', name, n),
  markUnlocked: (ids) => ipcRenderer.invoke('usage:markUnlocked', ids),
  getSnapshots: () => ipcRenderer.invoke('snapshots:get'),
  getBrowseLive: () => ipcRenderer.invoke('browse:live'),
  historyList: (id) => ipcRenderer.invoke('history:list', id),
  historyRead: (id, file) => ipcRenderer.invoke('history:read', id, file),
  getInstalledSkills: () => ipcRenderer.invoke('skills:installed'),
  storeGet: (name) => ipcRenderer.invoke('store:get', name),
  storeSet: (name, data) => ipcRenderer.invoke('store:set', name, data),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  ensureNote: (rel, content) => ipcRenderer.invoke('vault:ensureNote', rel, content),
  onUpdate: (cb) => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('update:status', h)
    return () => ipcRenderer.removeListener('update:status', h)
  }
})
