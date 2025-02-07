// stores are synced  between main and renderer processes. Both need access to these types and functions.

import type { WebsocketStatusType } from '../main/connection/model/HarmonyWebsocketConnection'
import { Friend, User } from '../main/LocalDatabase'
import { FriendConnectionStatus } from '../main/FriendConnectionHandler'

export const defaultState: State = {
  friendStates: [],
  connection: {
    state: 'disconnected',
    failedLoginMsg: null
  },
  user: {
    pk: null,
    serverEnabled: true,
    serverUrl: null
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

export type ScreenMode = 'chat' | 'add-friend' | 'user-settings' | 'server-settings' | 'edit-friend'

export type State = {
  friendStates: FriendState[]
  connection: {
    state: WebsocketStatusType
    failedLoginMsg: string | null
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
  | { type: 'set-local-pk'; payload: string | null }
  | { type: 'set-server-url'; payload: string | null }
  | { type: 'set-server-enabled'; payload: boolean }
  | { type: 'set-failed-login-msg'; payload: string | null }

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
          state: action.payload,
          // clear failed login message if no longer in a failed login state
          failedLoginMsg: action.payload != 'login-failed' ? null : state.connection.failedLoginMsg
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
    case 'set-local-pk':
      return {
        ...state,
        user: {
          ...state.user,
          pk: action.payload
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
  }
}
