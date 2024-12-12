import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { receiveFriendRequest } from './receiveFriendRequest'
import { receivePeerConnection } from './receivePeerConnection'
import { HarmonyRoutineParams } from '../../model/routine'
import { receiveFriendRejection } from './receiveFriendRejection'

/**
 * any incoming transaction socket initiated by the server gets routed through here.
 */
export async function masterRoutine(
  con: HarmonyWebsocketConnection,
  { send, recv }: HarmonyRoutineParams
) {
  let firstMsg: {
    initiate: 'receiveConnectionRequest' | 'receiveFriendRequest' | 'receiveFriendRejection'
  }
  try {
    firstMsg = (await recv()) as typeof firstMsg
  } catch (e) {
    console.error((e as Error).message)
    return
  }

  switch (firstMsg.initiate) {
    case 'receiveConnectionRequest':
      await receivePeerConnection(con, firstMsg as object, { send, recv })
      break
    case 'receiveFriendRequest':
      await receiveFriendRequest(con, firstMsg as object, { send, recv })
      break
    case 'receiveFriendRejection':
      await receiveFriendRejection(con, firstMsg as object)
      break
    default:
      try {
        send({
          terminate: 'cancel'
        })
      } catch {
        //
      }
      console.error('unknown incoming routine: ' + firstMsg.initiate)
  }
}
