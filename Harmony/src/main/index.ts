import { app, shell, BrowserWindow, dialog, Tray, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Controller } from './Controller'
import { ipcMainTypesafe } from './ipcMainTypesafe'
export const DEBUG = true

process.traceProcessWarnings = true

let mainWindow: BrowserWindow | undefined

// focus the main window. If it doesn't exist, create it
function focusMainWindow() {
  if (!mainWindow) {
    mainWindow = createMainWindow()
    mainWindow.on('close', () => {
      mainWindow = undefined
    })
  } else {
    mainWindow.focus()
  }
}

function createMainWindow(): BrowserWindow {
  // Create the browser window.
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // system tray
  const appIcon = new Tray(join(__dirname, '../../resources/smallIcon.png'))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Harmony Client', type: 'normal', enabled: false },
    { type: 'separator' },
    {
      label: 'Open',
      type: 'normal',
      click: focusMainWindow
    },
    { label: 'Quit', type: 'normal', click: app.quit }
  ])
  appIcon.setContextMenu(contextMenu)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const controller = new Controller()

  // 2 way, initiated by renderer
  ipcMainTypesafe.handle('getConversation', (_, ...args) => controller.db.getConversation(...args))
  ipcMainTypesafe.handle('sendMessage', (_, ...args) => controller.sendMessage(...args))
  ipcMainTypesafe.handle('sendFriendRequest', (_, ...args) => controller.sendFriendRequest(...args))
  ipcMainTypesafe.handle('showErrorBox', (_, ...args) => dialog.showErrorBox(...args))

  // main to renderer
  controller.onMainToRendererAction = (action) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('mainToRendererAction', action)
    })
  }

  focusMainWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) focusMainWindow()
  })

  app.on('before-quit', () => {
    controller.close()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // createWindow()
  // if (process.platform !== 'darwin') {
  //   app.quit()
  // }
})

export { app }
// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
