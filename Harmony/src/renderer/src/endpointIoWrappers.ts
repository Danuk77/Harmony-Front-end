import type { FriendBlockContextMenuOptions } from '../../common/friendBlockContextMenu'
import { assertNever } from '../../common/utils'
import type { Friend } from '../../main/LocalDatabase'
import { store } from './redux'

export function executeFriendOption(friend: Friend, option: FriendBlockContextMenuOptions) {
  switch (option) {
    case 'edit':
      store.dispatch({ type: 'setSelectedFriendPk', payload: { pk: friend.peerPk } })
      store.dispatch({ type: 'set-screen-mode', payload: 'edit-friend' })
      break
    case 'block':
      blockFriend(friend)
      break
    case 'delete':
      deleteFriendRecord(friend)
      break
    case 'unblock':
      unblockFriend(friend)
      break
    case 'send':
    case 'sendAnother':
    case 'sendNow':
    case 'renew':
      sendFriendRequest(friend.localPk, friend.peerPk, friend.nickname)
      break
    case 'accept':
    case 'acceptNow':
      acceptFriendRequest(friend)
      break
    case 'withdrawRequest':
      withdrawFriendRequest(friend)
      break
    case 'withdrawAccept':
      withdrawFriendAccept(friend)
      break
    case 'reconnect':
      reconnectToFriend(friend)
      break
    default:
      assertNever(option)
  }
}

export async function deleteFriendRecord(friend: Friend) {
  const confirm = await window.api.showMessageBox({
    message: `Are you sure you want to delete "${friend.nickname}"?`,
    detail: 'Your client will no longer connect to, or accept connections from this friend.',
    type: 'question',
    buttons: ['Cancel', 'Confirm']
  })
  if (confirm.response != 1 /*Confirm*/) {
    return
  }
  store.dispatch({
    type: 'remove-friend',
    payload: { localPk: friend.localPk, peerPk: friend.peerPk }
  })
}

/**Send a friend request, and display result in message boxes */
export function sendFriendRequest(localPk: string, peerPk: string, nickname: string) {
  window.api.sendFriendRequest(localPk, peerPk, nickname).then((result) => {
    switch (result.status) {
      case 'fail':
        window.api.showMessageBox({
          message: 'Failed to send friend request',
          detail: result.msg,
          type: 'error'
        })
        break
      case 'offline':
        window.api.showMessageBox({
          message: 'Friend is currently offline',
          detail: 'The request will be periodically resent.',
          type: 'info'
        })
        break
      case 'succeed':
        switch (result.type) {
          case 'accept':
            store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
            break
          case 'reject':
            window.api.showMessageBox({
              message: 'Friend request not successful',
              detail: 'Your friend request was rejected by the peer',
              type: 'info'
            })
            break
          case 'pending':
            store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
            break
        }
    }
  })
}

export async function blockFriend(friend: Friend) {
  const confirm = await window.api.showMessageBox({
    message: `Are you sure you want to block "${friend.nickname}"?`,
    detail:
      'This will send a friend rejection message to the friend via the server, and hide this friend in this client.',
    type: 'question',
    buttons: ['Cancel', 'Confirm']
  })
  if (confirm.response != 1 /*Confirm*/) {
    return
  }

  const result = await window.api.sendFriendRejection(friend.localPk, friend.peerPk)
  switch (result.status) {
    case 'fail':
      window.api.showMessageBox({
        message: `The friend rejection failed to be delivered.`,
        detail: `If the friend ever tries to connect to us, another rejection will be sent. Reason: ${result.msg}`,
        type: 'error'
      })
      return false
    case 'offline':
      window.api.showMessageBox({
        message: `The friend is currently offline, so the rejection was not delivered.`,
        detail: `If the friend ever tries to connect to us, another rejection will be sent.`,
        type: 'info'
      })
      return false
    case 'succeed':
      return true
  }
}

export async function acceptFriendRequest(friend: Friend) {
  const result = await window.api.sendFriendRequest(friend.localPk, friend.peerPk, friend.nickname)
  switch (result.status) {
    case 'fail':
      window.api.showMessageBox({
        message: 'Failed to send friend acceptance.',
        detail: `Reason: ${result.msg}`,
        type: 'error'
      })
      break
    case 'offline':
      window.api.showMessageBox({
        message: 'Friend is currently offline.',
        detail: 'The acceptance will be periodically resent.',
        type: 'info'
      })
      break
    case 'succeed':
      switch (result.type) {
        case 'accept':
          store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
          break
        case 'reject':
          window.api.showMessageBox({
            message: 'Your friend acceptance was rejected by the peer.',
            type: 'info'
          })
          break
        case 'pending':
          window.api.showMessageBox({
            message:
              'The friend has deleted their original friend request. A new friend request has been sent to them.',
            type: 'info'
          })
          store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
          break
      }
  }
}

export async function unblockFriend(friend: Friend) {
  await window.api.unblockFriend(friend.localPk, friend.peerPk)
}

export async function withdrawFriendRequest(friend: Friend) {
  await window.api.withdrawFriendRequest(friend.localPk, friend.peerPk)
}

export async function withdrawFriendAccept(friend: Friend) {
  await window.api.withdrawFriendAccept(friend.localPk, friend.peerPk)
}

export async function reconnectToFriend(friend: Friend) {
  window.api.forceFriendReconnect(friend.peerPk)
}
