const { shell } = require('electron/common')
const { app, Menu } = require('electron/main')

export function applicationMenu() {
  const isMac = process.platform === 'darwin'
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
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
