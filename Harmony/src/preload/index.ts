import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Friend, Message } from '../main/LocalDatabase'
import { FriendConnectionStatus } from '../main/FriendConnectionHandler'
import { WebsocketStatusType } from '../main/connection/model/HarmonyWebsocketConnection'

export type FriendWithState = Friend & {
  connectionStatus: FriendConnectionStatus
}

// all one-way actions sent from main to renderer.
export type MainToRendererAction =
  | {
      type: 'add-friend'
      payload: FriendWithState
    }
  | {
      type: 'friend-change'
      // 'peerPk' and 'localPk' fields required, rest optional
      payload: Pick<FriendWithState, 'peerPk' | 'localPk'> & Partial<FriendWithState>
    }
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
      type: 'websocket-status-change'
      payload: WebsocketStatusType
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
  onMainToRendererAction: (callback: (arg0: MainToRendererAction) => unknown) =>
    ipcRenderer.on('mainToRendererAction', (_event, value) => callback(value))
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
