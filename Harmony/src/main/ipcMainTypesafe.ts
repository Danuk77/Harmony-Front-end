import { ipcMain } from 'electron'
import { Api } from '../preload'

// using api defined in preload
export const ipcMainTypesafe = {
  handle: <K extends keyof Api>(
    channel: K,
    listener: (
      event: Parameters<Parameters<(typeof ipcMain)['handle']>['1']>['0'],
      ...args: Parameters<Api[K]>
    ) => ReturnType<Api[K]>
  ) => ipcMain.handle(channel, listener)
}
