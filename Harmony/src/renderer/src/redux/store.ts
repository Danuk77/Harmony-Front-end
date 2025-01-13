import { configureStore } from '@reduxjs/toolkit'
import { reducer } from '../../../main/redux/store'

export const store = configureStore({
  reducer
  // enhancers: (defaultEnhancers) => {
  //   return defaultEnhancers().prepend(window.__ElectronReduxBridge.stateSyncEnhancer())
  // }
})

store.subscribe(() => {
  console.log(store.getState())
})
