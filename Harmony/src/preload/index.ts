import 'electron-redux/preload'
import { contextBridge, dialog, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Friend, LocalDatabase, Message } from '../main/LocalDatabase'
import { Controller } from '../main/Controller'
import { showFriendBlockContextMenu } from '../main/showFriendBlockContextMenu'
import { generateKeyPair, verifyKeyPair } from '../main/generateKeyPair'
import {
  MainToRenderer2WayActionArgs,
  MainToRendererComManager
} from '../main/MainToRendererComManager'
import { FriendConnectionStatus } from '../main/FriendConnectionHandler'
import { FriendRoster } from '../main/FriendRoster'
import { ICECandidate } from '../main/friendCtlRoutines/VideoCallRoutine'

export type FriendWithState = Friend & {
  connectionStatus: FriendConnectionStatus
}

// all one-way actions sent from main to renderer.
export type MainToRenderer1WayAction =
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
  | {
      type: 'peerSdpAnswerForVideoCall'
      payload: {
        peerPk: string
        sdp: {
          type: 'answer'
          sdp: string
        }
      }
    }
  | {
      type: 'peerIceCandidateForVideoCall'
      payload: {
        peerPk: string
        candidate: ICECandidate
      }
    }

// Custom APIs for renderer
const api = {
  test: () => console.log('hello'),
  getConversation: <LocalDatabase['getConversation']>(
    ((...args) => ipcRenderer.invoke('getConversation', ...args))
  ),
  sendMessage: <Controller['sendMessage']>((...args) => ipcRenderer.invoke('sendMessage', ...args)),
  onMainToRenderer1WayAction: (callback: (arg0: MainToRenderer1WayAction) => unknown) =>
    ipcRenderer.on('mainToRenderer1WayAction', (_event, value) => callback(value)),
  onMainToRenderer2WayAction: (
    callback: (arg0: { id: number; args: MainToRenderer2WayActionArgs }) => unknown
  ) => ipcRenderer.on('mainToRenderer2WayAction', (_event, value) => callback(value)),
  mainToRenderer2WayActionResponse: <MainToRendererComManager['receiveMessageFromRenderer']>(
    ((...args) => ipcRenderer.invoke('mainToRenderer2WayActionResponse', ...args))
  ),
  sendFriendRequest: <Controller['sendFriendRequest']>(
    ((...args) => ipcRenderer.invoke('sendFriendRequest', ...args))
  ),
  sendFriendRejection: <Controller['sendFriendRejection']>(
    ((...args) => ipcRenderer.invoke('sendFriendRejection', ...args))
  ),
  unblockFriend: <Controller['unblockFriend']>(
    ((...args) => ipcRenderer.invoke('unblockFriend', ...args))
  ),
  withdrawFriendRequest: <Controller['withdrawFriendRequest']>(
    ((...args) => ipcRenderer.invoke('withdrawFriendRequest', ...args))
  ),
  withdrawFriendAccept: <Controller['withdrawFriendAccept']>(
    ((...args) => ipcRenderer.invoke('withdrawFriendAccept', ...args))
  ),
  showErrorBox: <typeof dialog.showErrorBox>(
    ((...args) => ipcRenderer.invoke('showErrorBox', ...args))
  ),
  showMessageBox: <typeof dialog.showMessageBox>(
    ((...args) => ipcRenderer.invoke('showMessageBox', ...args))
  ),
  showFriendBlockContextMenu: <typeof showFriendBlockContextMenu>(
    ((...args) => ipcRenderer.invoke('showFriendBlockContextMenu', ...args))
  ),
  generateKeyPair: <typeof generateKeyPair>(
    ((...args) => ipcRenderer.invoke('generateKeyPair', ...args))
  ),
  verifyKeyPair: <typeof verifyKeyPair>((...args) => ipcRenderer.invoke('verifyKeyPair', ...args)),
  forwardICECandidateForVideoCall: <FriendRoster['forwardICECandidateForVideoCall']>(
    ((...args) => ipcRenderer.invoke('forwardICECandidateForVideoCall', ...args))
  ),
  hangUpAndCloseVideoCall: <FriendRoster['hangUpAndCloseVideoCall']>(
    ((...args) => ipcRenderer.invoke('hangUpAndCloseVideoCall', ...args))
  ),
  errorVideoCall: <FriendRoster['errorVideoCall']>(
    ((...args) => ipcRenderer.invoke('errorVideoCall', ...args))
  ),
  signallingCompleteVideoCall: <FriendRoster['signallingCompleteVideoCall']>(
    ((...args) => ipcRenderer.invoke('signallingCompleteVideoCall', ...args))
  ),
  peerHangsUpVideoCall: <FriendRoster['peerHangsUpVideoCall']>(
    ((...args) => ipcRenderer.invoke('peerHangsUpVideoCall', ...args))
  ),
  weAcceptVideoCall: <FriendRoster['weAcceptVideoCall']>(
    ((...args) => ipcRenderer.invoke('weAcceptVideoCall', ...args))
  ),
  sendVideoCallRequest: <FriendRoster['sendVideoCallRequest']>(
    ((...args) => ipcRenderer.invoke('sendVideoCallRequest', ...args))
  ),
  videoCallWindowOpens: <FriendRoster['videoCallWindowOpens']>(
    ((...args) => ipcRenderer.invoke('videoCallWindowOpens', ...args))
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
