// stores are synced  between main and renderer processes. Both need access to these types and functions.

import type { WebsocketStatusType } from 'node-harmonyclient'
import { Friend, User } from '../main/LocalDatabase'
import { FriendVideoCallStatus } from '../main/VideoCallManager'
import { FriendConnectionStatus } from '../main/FriendConnectionHandler'

export const defaultState: State = {
  friendStates: [],
  connection: {
    state: 'disconnected',
    failedLoginMsg: null,
    failedConnectMsg: null
  },
  user: {
    keyPair: null,
    serverEnabled: true,
    serverUrl: null,
    stunServer: null,
    turnServer: null,
    cameraId: null,
    microphoneId: null
  },
  ui: {
    selectedFriendPk: null,
    screenMode: 'chat'
  }
}

export const defaultVideoCallStatus: FriendVideoCallStatus = {
  callDirection: 'none',
  accepted: false,
  window: 'closed',
  call: 'none',
  errorMsg: null,
  id: null
}

export type KeyPair = {
  publicKey: string
  privateKey: string
}

export type FriendState = {
  // main source of truth.
  friend: Friend

  // not main source of truth - updated from FriendConnectionHandler - main use is for the ui
  videoCallStatus: FriendVideoCallStatus
  // not main source of truth - updated from FriendConnectionHandler - main use is for the ui
  connectionStatus: FriendConnectionStatus
}

export type IceServer = {
  urls: string
  credential?: string
  username?: string
}

export type ScreenMode =
  | 'chat'
  | 'add-friend'
  | 'user-settings'
  | 'server-settings'
  | 'edit-friend'
  | 'edit-keypair'

export type State = {
  friendStates: FriendState[]
  connection: {
    state: WebsocketStatusType
    failedLoginMsg: string | null
    failedConnectMsg: string | null
  }
  user: User
  ui: {
    selectedFriendPk: string | null
    screenMode: ScreenMode
  }
}

export type Action =
  | {
      type: 'add-friend'
      payload: Friend
    }
  | {
      type: 'friend-change'
      // 'peerPk' and 'localPk' fields required, rest optional
      payload: {
        friend: Pick<Friend, 'peerPk' | 'localPk'> & Partial<Friend>
      }
    }
  | {
      type: 'friend-connection-status-change'
      payload: {
        friend: Pick<Friend, 'peerPk'>
        connectionStatus: FriendState['connectionStatus']
      }
    }
  | {
      type: 'friend-video-call-status-change'
      payload: {
        friend: Pick<Friend, 'peerPk'>
        callStatus: FriendState['videoCallStatus']
      }
    }
  | {
      type: 'remove-friend'
      payload: Pick<Friend, 'peerPk' | 'localPk'>
    }
  | {
      type: 'websocket-status-change'
      payload: WebsocketStatusType
    }
  | {
      type: 'setSelectedFriendPk'
      payload: {
        pk: string
      }
    }
  | { type: 'hydrate-friends'; payload: Friend[] }
  | { type: 'hydrate-user'; payload: User }
  | { type: 'set-screen-mode'; payload: ScreenMode }
  | { type: 'set-key-pair'; payload: KeyPair }
  | { type: 'set-server-url'; payload: string | null }
  | { type: 'set-server-enabled'; payload: boolean }
  | { type: 'set-failed-login-msg'; payload: string | null }
  | { type: 'set-failed-connect-msg'; payload: string | null }
  | { type: 'set-stun-server'; payload: IceServer | null }
  | { type: 'set-turn-server'; payload: IceServer | null }

export function reducer(state: State | undefined = defaultState, action: Action): State {
  switch (action.type) {
    case 'add-friend':
      return {
        ...state,
        friendStates: [
          ...state.friendStates,
          {
            friend: action.payload,
            connectionStatus: 'unset',
            videoCallStatus: defaultVideoCallStatus
          }
        ]
      }
    case 'friend-change':
      return {
        ...state,
        friendStates: state.friendStates.map((friendState) => {
          if (
            friendState.friend.localPk == action.payload.friend.localPk &&
            friendState.friend.peerPk == action.payload.friend.peerPk
          ) {
            return {
              ...friendState,
              friend: { ...friendState.friend, ...action.payload.friend }
            }
          } else {
            return friendState
          }
        })
      }

    case 'remove-friend':
      return {
        ...state,
        friendStates: state.friendStates.filter(
          (friendState) =>
            !(
              friendState.friend.localPk == action.payload.localPk &&
              friendState.friend.peerPk == action.payload.peerPk
            )
        )
      }
    case 'websocket-status-change': {
      return {
        ...state,
        connection: {
          ...state.connection,
          state: action.payload,
          // clear failed login message if no longer in a failed login state
          failedLoginMsg: action.payload != 'login-failed' ? null : state.connection.failedLoginMsg,
          // clear failed connect message
          failedConnectMsg:
            action.payload != 'disconnected' ? null : state.connection.failedConnectMsg
        }
      }
    }
    case 'setSelectedFriendPk':
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedFriendPk: action.payload.pk
        }
      }
    case 'friend-connection-status-change':
      return {
        ...state,
        friendStates: state.friendStates.map((fs) => {
          if (fs.friend.peerPk == action.payload.friend.peerPk) {
            return {
              ...fs,
              connectionStatus: action.payload.connectionStatus
            }
          } else {
            return fs
          }
        })
      }
    case 'friend-video-call-status-change':
      return {
        ...state,
        friendStates: state.friendStates.map((fs) => {
          if (fs.friend.peerPk == action.payload.friend.peerPk) {
            return {
              ...fs,
              videoCallStatus: action.payload.callStatus
            }
          } else {
            return fs
          }
        })
      }
    case 'hydrate-friends':
      return {
        ...state,
        friendStates: action.payload.map((friend) => ({
          friend: friend,
          // keep the old connection status if it exists
          connectionStatus:
            state.friendStates.find((fr) => fr.friend.peerPk == friend.peerPk)?.connectionStatus ??
            'unset',
          videoCallStatus:
            state.friendStates.find((fr) => fr.friend.peerPk == friend.peerPk)?.videoCallStatus ??
            defaultVideoCallStatus
        }))
      }
    case 'hydrate-user':
      return {
        ...state,
        user: action.payload
      }
    case 'set-screen-mode':
      return {
        ...state,
        ui: {
          ...state.ui,
          screenMode: action.payload
        }
      }
    case 'set-key-pair':
      return {
        ...state,
        user: {
          ...state.user,
          keyPair: action.payload
        }
      }
    case 'set-server-url':
      return {
        ...state,
        user: {
          ...state.user,
          serverUrl: action.payload
        }
      }
    case 'set-server-enabled':
      return {
        ...state,
        user: {
          ...state.user,
          serverEnabled: action.payload
        }
      }
    case 'set-failed-login-msg':
      return {
        ...state,
        connection: {
          ...state.connection,
          failedLoginMsg: action.payload
        }
      }
    case 'set-failed-connect-msg':
      return {
        ...state,
        connection: {
          ...state.connection,
          failedConnectMsg: action.payload
        }
      }
    case 'set-stun-server':
      return {
        ...state,
        user: {
          ...state.user,
          stunServer: action.payload
        }
      }
    case 'set-turn-server':
      return {
        ...state,
        user: {
          ...state.user,
          turnServer: action.payload
        }
      }
  }
}
