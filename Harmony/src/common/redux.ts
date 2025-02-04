// stores are synced  between main and renderer processes. Both need access to these types and functions.

import type { WebsocketStatusType } from '../main/connection/model/HarmonyWebsocketConnection'
import { Friend } from '../main/LocalDatabase'
import { FriendConnectionStatus } from '../main/FriendConnectionHandler'

export const defaultState: State = {
  friendStates: [],
  connection: {
    pk: null,
    state: 'disconnected',
    url: 'ws://localhost:8080/ws',
    serverEnabled: true
  },
  ui: {
    selectedFriendPk: null,
    screenMode: 'chat'
  }
}

export type FriendState = {
  friend: Friend
  connectionStatus: FriendConnectionStatus
}

export type ScreenMode = 'chat' | 'add-friend' | 'user-settings' | 'server-settings'

export type State = {
  friendStates: FriendState[]
  connection: {
    pk: string | null
    state: WebsocketStatusType
    url: string | null
    failedLoginMsg?: string
    serverEnabled: boolean
  }
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
  | { type: 'set-screen-mode'; payload: ScreenMode }
  | { type: 'set-local-pk'; payload: string | null }
  | { type: 'set-server-url'; payload: string | null }
  | { type: 'set-server-enabled'; payload: boolean }

export function reducer(state: State | undefined = defaultState, action: Action): State {
  switch (action.type) {
    case 'add-friend':
      return {
        ...state,
        friendStates: [...state.friendStates, { friend: action.payload, connectionStatus: 'unset' }]
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
          state: action.payload
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
    case 'hydrate-friends':
      return {
        ...state,
        friendStates: action.payload.map((friend) => ({
          friend: friend,
          // keep the old connection status if it exists
          connectionStatus:
            state.friendStates.find((fr) => fr.friend.peerPk == friend.peerPk)?.connectionStatus ??
            'unset'
        }))
      }
    case 'set-screen-mode':
      return {
        ...state,
        ui: {
          ...state.ui,
          screenMode: action.payload
        }
      }
    case 'set-local-pk':
      return {
        ...state,
        connection: {
          ...state.connection,
          pk: action.payload
        }
      }
    case 'set-server-url':
      return {
        ...state,
        connection: {
          ...state.connection,
          url: action.payload
        }
      }
    case 'set-server-enabled':
      return {
        ...state,
        connection: {
          ...state.connection,
          serverEnabled: action.payload
        }
      }
  }
}
