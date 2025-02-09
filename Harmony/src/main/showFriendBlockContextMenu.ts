import { Menu } from 'electron'
import { Friend } from './LocalDatabase'
import {
  friendBlockContextMenuAvailableOptions,
  friendBlockContextMenuLabels,
  FriendBlockContextMenuOptions
} from '../common/friendBlockContextMenu'

/**
 * Context menu for right-clicking on a friend block
 */

export const showFriendBlockContextMenu = (
  friend: Friend
): Promise<FriendBlockContextMenuOptions | null> => {
  return new Promise((resolve) => {
    const template: Parameters<(typeof Menu)['buildFromTemplate']>[0] = []
    for (const option of friendBlockContextMenuAvailableOptions(friend)) {
      template.push({
        label: friendBlockContextMenuLabels[option],
        click: () => resolve(option)
      })
    }
    const menu = Menu.buildFromTemplate(template)

    // display menu. return null if no option chosen
    menu.popup({ callback: () => resolve(null) })
  })
}
