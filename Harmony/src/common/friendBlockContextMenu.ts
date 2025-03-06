import { Friend } from '../main/LocalDatabase'

export type FriendBlockContextMenuOptions =
  | 'edit'
  | 'block'
  | 'delete'
  | 'unblock'
  | 'send'
  | 'accept'
  | 'sendAnother'
  | 'renew'
  | 'sendNow'
  | 'acceptNow'
  | 'withdrawRequest'
  | 'withdrawAccept'
export const friendBlockContextMenuLabels: Record<FriendBlockContextMenuOptions, string> = {
  accept: 'Accept',
  block: 'Block',
  delete: 'Delete',
  edit: 'Edit',
  unblock: 'Unblock',
  acceptNow: 'Accept now',
  renew: 'Resend friend request',
  sendNow: 'Send request now',
  send: 'Send request',
  sendAnother: 'Send another request',
  withdrawAccept: 'Withdraw unsent friend acceptance',
  withdrawRequest: 'Withdraw unsent friend request'
}

/**@todo */
export const friendBlockContextMenuAvailableOptions = (friend: Friend) => {
  const options: FriendBlockContextMenuOptions[] = ['edit']
  switch (friend.status) {
    case 'accept':
      options.push('renew', 'block')
      break
    case 'blocking':
      options.push('send', 'block')
      break
    case 'blocked':
      options.push('unblock')
      break
    case 'none':
      options.push('send', 'block')
      break
    case 'friend-request:awaiting-our-response':
      options.push('accept', 'block')
      break
    case 'friend-request:considering-our-request':
      options.push('sendAnother', 'block')
      break
    case 'friend-request:offline-and-our-friend-request-unsent':
      options.push('withdrawRequest', 'sendNow', 'block')
      break
    case 'friend-request:offline-and-our-friend-accept-unsent':
      options.push('withdrawAccept', 'acceptNow', 'block')
      break
  }
  options.push('delete')
  return options
}
