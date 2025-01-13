import { configureStore, Dispatch } from '@reduxjs/toolkit'
// import { stateSyncEnhancer } from 'electron-redux/main'
import { FriendWithState } from '../../preload'
import { WebsocketStatusType } from '../connection/model/HarmonyWebsocketConnection'

export const defaultState: State = {
  friends: [],
  connection: {
    state: 'disconnected'
  }
}

export const store = configureStore({
  reducer
  // enhancers: (defaultEnhancers) => defaultEnhancers().prepend(stateSyncEnhancer())
})

export const storeTypesafe = {
  dispatch: <Dispatch<Action>>store.dispatch
}

type State = {
  friends: FriendWithState[]
  connection: {
    state: WebsocketStatusType
    failedLoginMsg?: string
  }
}

export type Action =
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
      type: 'remove-friend'
      payload: Pick<FriendWithState, 'peerPk' | 'localPk'>
    }
  | {
      type: 'websocket-status-change'
      payload: WebsocketStatusType
    }

export function reducer(state: State | undefined = defaultState, action: Action): State {
  switch (action.type) {
    case 'add-friend':
      return {
        ...state,
        friends: [...state.friends, action.payload]
      }
    case 'friend-change':
      return {
        ...state,
        friends: state.friends.map((friend) => {
          if (friend.localPk == action.payload.localPk && friend.peerPk == action.payload.peerPk) {
            return { ...friend, ...action.payload }
          } else {
            return friend
          }
        })
      }

    case 'remove-friend':
      return {
        ...state,
        friends: state.friends.filter(
          (friend) =>
            !(friend.localPk == action.payload.localPk && friend.peerPk == action.payload.peerPk)
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
  }
}
