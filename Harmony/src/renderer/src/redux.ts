import { configureStore, type Dispatch } from '@reduxjs/toolkit'
import { reducer, type Action, type State, defaultState } from '../../common/redux'
import { stateSyncEnhancer } from 'electron-redux/renderer'

const _store = configureStore({
  reducer,
  enhancers: (defaultEnhancers) => {
    return defaultEnhancers().prepend(
      // sync with main process
      stateSyncEnhancer({
        lazyInit: true /**shouldn't need to do this, but it doesn't work without..? */
      })
    )
  }
})

// wrap the store so it works nicely with $store notation in svelte
export const store = {
  ..._store,
  // add correct type to dispatch as well
  dispatch: <Dispatch<Action>>_store.dispatch,
  subscribe: (listener: (state: State) => unknown) => {
    listener(_store.getState() ?? defaultState)
    return _store.subscribe(() => listener(_store.getState()))
  }
}
