const { shell } = require('electron/common')
const { Menu } = require('electron/main')

export function applicationMenu() {
  const isMac = process.platform === 'darwin'
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(process.defaultApp ? [{ role: 'toggleDevTools' as const }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Visit GitHub Repo',
          click: async () => {
            await shell.openExternal('https://github.com/Danuk77/Harmony-Front-end')
          }
        }
      ]
    }
  ])
}
