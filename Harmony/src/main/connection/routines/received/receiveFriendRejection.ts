import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'

/**
 * Called by the master routine when a new transaction socket is received with "initiate":"receiveFriendRejection"
 * Calls the callback con.onReceiveFriendRejection.
 */
export async function receiveFriendRejection(con: HarmonyWebsocketConnection, firstMsg: object) {
  const firstMsgTyped = firstMsg as {
    initiate: 'receiveFriendRejection'
    key: string
    terminate: 'done'
  }
  con.onReceiveFriendRejection?.(firstMsgTyped.key)
}
