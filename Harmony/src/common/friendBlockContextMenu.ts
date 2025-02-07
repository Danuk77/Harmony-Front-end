import { Friend } from '../main/LocalDatabase'

export type FriendBlockContextMenuOptions = 'delete' | 'edit' | 'block' | 'unblock' | 'accept'
export const friendBlockContextMenuLabels: Record<FriendBlockContextMenuOptions, string> = {
  accept: 'Accept',
  block: 'Block',
  delete: 'Delete',
  edit: 'Edit',
  unblock: 'Unblock'
}

export const friendBlockContextMenuAvailableOptions = (friend: Friend) => {
  const options: FriendBlockContextMenuOptions[] = []
  switch (friend.status) {
    case 'block':
      options.push('unblock')
      break
    case 'reject':
    case 'accept':
    case 'awaiting-response':
      options.push('edit', 'block')
      break
    case 'pending':
      options.push('accept', 'block')
      break
  }
  options.push('delete')
  return options
}
