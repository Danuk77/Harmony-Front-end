import { configureStore, createListenerMiddleware, Dispatch } from '@reduxjs/toolkit'
import { stateSyncEnhancer } from 'electron-redux/main'
import { Action, reducer, State } from '../common/redux'

const listenerMiddleware = createListenerMiddleware()

export const store = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
  enhancers: (defaultEnhancers) => defaultEnhancers().prepend(stateSyncEnhancer())
})

export const storeTypesafe = {
  dispatch: <Dispatch<Action>>store.dispatch
}

export const startAppListening = listenerMiddleware.startListening.withTypes<
  State,
  (typeof store)['dispatch']
>()

export const getFriendState = (localPk: string, peerPk: string) => {
  return store
    .getState()
    .friendStates.find((fs) => fs.friend.localPk == localPk && fs.friend.peerPk == peerPk)
}
