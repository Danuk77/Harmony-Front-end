import {
  app,
  shell,
  BrowserWindow,
  dialog,
  Tray,
  Menu,
  Notification,
  NativeImage,
  nativeImage,
  nativeTheme
} from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../build/icon.png?asset'
import { Controller } from './Controller'
import { ipcMainTypesafe } from './ipcMainTypesafe'
import { showFriendBlockContextMenu } from './showFriendBlockContextMenu'
import { generateKeyPair, verifyKeyPair } from 'node-harmonyclient'
import { mainToRendererComManager } from './MainToRendererComManager'
import { applicationMenu } from './applicationMenu'
import { logger } from './logging'
export const DEBUG = true

process.traceProcessWarnings = true

let mainWindow: BrowserWindow | undefined

// prevent multiple instances
// if user tries to open another instance, focus/create the main window of the already open one
const isOnlyInstance = app.requestSingleInstanceLock()
if (!isOnlyInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusMainWindow()
  })
}

// focus the main window. If it doesn't exist, create it
function focusMainWindow() {
  if (!mainWindow) {
    mainWindow = createMainWindow()
    mainWindow.on('close', () => {
      mainWindow = undefined
    })
  } else {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.moveTop()
    mainWindow.focus()
  }
}

nativeTheme.themeSource = 'light'

function createMainWindow(): BrowserWindow {
  // Create the browser window.
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 550,
    minHeight: 300,
    darkTheme: true,
    ...(process.platform !== 'darwin'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#201b2f',
            height: 24,
            symbolColor: '#afafaf'
          }
        }
      : {}),
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const editableMenu = Menu.buildFromTemplate([
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' }
  ])
  const selectableMenu = Menu.buildFromTemplate([{ role: 'copy' }])
  window.webContents.on('context-menu', (_event, params) => {
    // only show the context menu if the element is editable
    if (params.isEditable) {
      editableMenu.popup()
    } else if (params.selectionText) {
      selectableMenu.popup()
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

Menu.setApplicationMenu(applicationMenu())

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.harmonyclient')

  // system tray
  let appIconImage: NativeImage | undefined = undefined
  if (process.platform == 'darwin') {
    // on macos use pure-black image template
    appIconImage = nativeImage.createFromPath(
      join(__dirname, '../../resources/icon-mac-Template.png')
    )
  } else if (process.platform == 'win32') {
    appIconImage = nativeImage.createFromPath(join(__dirname, '../../resources/icon.ico'))
  }
  if (!appIconImage) {
    appIconImage = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  }
  const appIcon = new Tray(appIconImage)
  const trayMenu = Menu.buildFromTemplate([
    { label: 'Harmony Client', type: 'normal', enabled: false },
    { type: 'separator' },
    {
      label: 'Open',
      type: 'normal',
      click: focusMainWindow
    },
    { label: 'Quit', type: 'normal', click: app.quit }
  ])
  appIcon.setContextMenu(trayMenu)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const controller = new Controller()

  controller.onNotification = (notification, dontShowIfFocused, onclick) => {
    if (!(dontShowIfFocused && mainWindow?.isFocused())) {
      const notif = new Notification(notification)
      notif.on('click', () => {
        onclick?.()
        focusMainWindow()
      })
      notif.show()
    }
  }

  // main to renderer 2 way
  mainToRendererComManager.setSendCallback((id, args) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('mainToRenderer2WayAction', { id, args })
    })
  })
  ipcMainTypesafe.handle('mainToRenderer2WayActionResponse', (_, ...args) =>
    mainToRendererComManager.receiveMessageFromRenderer(...args)
  )

  // main to renderer 1 way
  controller.onMainToRenderer1WayAction = (action) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('mainToRenderer1WayAction', action)
    })
  }

  // 2 way, initiated by renderer
  ipcMainTypesafe.handle('beep', (_, ...args) => shell.beep(...args))
  ipcMainTypesafe.handle('getConversation', (_, ...args) => controller.db.getConversation(...args))
  ipcMainTypesafe.handle('sendMessage', (_, ...args) => controller.sendMessage(...args))
  ipcMainTypesafe.handle('sendFriendRequest', (_, ...args) => controller.sendFriendRequest(...args))
  ipcMainTypesafe.handle('sendFriendRejection', (_, ...args) =>
    controller.sendFriendRejection(...args)
  )
  ipcMainTypesafe.handle('unblockFriend', (_, ...args) => controller.unblockFriend(...args))
  ipcMainTypesafe.handle('withdrawFriendRequest', (_, ...args) =>
    controller.withdrawFriendRequest(...args)
  )
  ipcMainTypesafe.handle('withdrawFriendAccept', (_, ...args) =>
    controller.withdrawFriendAccept(...args)
  )
  ipcMainTypesafe.handle('showErrorBox', (_, ...args) => dialog.showErrorBox(...args))
  ipcMainTypesafe.handle('showMessageBox', (_, ...args) => dialog.showMessageBox(...args))
  ipcMainTypesafe.handle('showFriendBlockContextMenu', (_, ...args) =>
    showFriendBlockContextMenu(...args)
  )
  ipcMainTypesafe.handle('generateKeyPair', (_, ...args) => generateKeyPair(...args))
  ipcMainTypesafe.handle('verifyKeyPair', (_, ...args) => verifyKeyPair(...args))

  ipcMainTypesafe.handle('forwardICECandidateForVideoCall', (_, ...args) =>
    controller.friendRoster.forwardICECandidateForVideoCall(...args)
  )
  ipcMainTypesafe.handle('hangUpAndCloseVideoCall', (_, ...args) =>
    controller.friendRoster.hangUpAndCloseVideoCall(...args)
  )
  ipcMainTypesafe.handle('errorVideoCall', (_, ...args) =>
    controller.friendRoster.errorVideoCall(...args)
  )
  ipcMainTypesafe.handle('signallingCompleteVideoCall', (_, ...args) =>
    controller.friendRoster.signallingCompleteVideoCall(...args)
  )
  ipcMainTypesafe.handle('peerHangsUpVideoCall', (_, ...args) =>
    controller.friendRoster.peerHangsUpVideoCall(...args)
  )
  ipcMainTypesafe.handle('weAcceptVideoCall', (_, ...args) =>
    controller.friendRoster.weAcceptVideoCall(...args)
  )
  ipcMainTypesafe.handle('sendVideoCallRequest', (_, ...args) =>
    controller.friendRoster.sendVideoCallRequest(...args)
  )
  ipcMainTypesafe.handle('videoCallWindowOpens', (_, ...args) =>
    controller.friendRoster.videoCallWindowOpens(...args)
  )
  ipcMainTypesafe.handle('forceFriendReconnect', (_, ...args) =>
    controller.friendRoster.forceFriendReconnect(...args)
  )

  focusMainWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) focusMainWindow()
  })

  app.on('before-quit', () => {
    controller.close()
  })

  logger.info('Starting application')
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
