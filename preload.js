'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  convert: (filePath, options) => ipcRenderer.invoke('convert', filePath, options),
  saveFile: (payload) => ipcRenderer.invoke('dialog:saveFile', payload),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  getPathForFile: (file) => webUtils.getPathForFile(file)
});
