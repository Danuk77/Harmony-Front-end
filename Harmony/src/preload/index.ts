import 'electron-redux/preload'
import { contextBridge, dialog, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Friend, LocalDatabase, Message } from '../main/LocalDatabase'
import { FriendConnectionStatus } from '../main/FriendConnectionHandler'
import { Controller } from '../main/Controller'
import { showFriendBlockContextMenu } from '../main/showFriendBlockContextMenu'

export type FriendWithState = Friend & {
  connectionStatus: FriendConnectionStatus
}

// all one-way actions sent from main to renderer.
export type MainToRendererAction =
  | {
      type: 'failed-login'
      payload: {
        reason: string
      }
    }
  | {
      type: 'receive-message'
      payload: Message
    }
  | {
      type: 'error'
      payload: {
        msg: string
      }
    }

// Custom APIs for renderer
const api = {
  test: () => console.log('hello'),
  getConversation: <LocalDatabase['getConversation']>(
    ((...args) => ipcRenderer.invoke('getConversation', ...args))
  ),
  sendMessage: <Controller['sendMessage']>((...args) => ipcRenderer.invoke('sendMessage', ...args)),
  onMainToRendererAction: (callback: (arg0: MainToRendererAction) => unknown) =>
    ipcRenderer.on('mainToRendererAction', (_event, value) => callback(value)),
  sendFriendRequest: <Controller['sendFriendRequest']>(
    ((...args) => ipcRenderer.invoke('sendFriendRequest', ...args))
  ),
  sendFriendRejection: <Controller['sendFriendRejection']>(
    ((...args) => ipcRenderer.invoke('sendFriendRejection', ...args))
  ),
  showErrorBox: <typeof dialog.showErrorBox>(
    ((...args) => ipcRenderer.invoke('showErrorBox', ...args))
  ),
  showMessageBox: <typeof dialog.showMessageBox>(
    ((...args) => ipcRenderer.invoke('showMessageBox', ...args))
  ),
  showFriendBlockContextMenu: <typeof showFriendBlockContextMenu>(
    ((...args) => ipcRenderer.invoke('showFriendBlockContextMenu', ...args))
  )
}

export type Api = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
