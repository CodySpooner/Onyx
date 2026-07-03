import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('onyx', {
  getGraph: () => ipcRenderer.invoke('vault:getGraph'),
  readNote: (id) => ipcRenderer.invoke('vault:readNote', id),
  pickVault: () => ipcRenderer.invoke('vault:pickVault'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  onGraphUpdate: (cb) => {
    const h = (_e, g) => cb(g)
    ipcRenderer.on('vault:update', h)
    return () => ipcRenderer.removeListener('vault:update', h)
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (cb) => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('update:status', h)
    return () => ipcRenderer.removeListener('update:status', h)
  }
})
