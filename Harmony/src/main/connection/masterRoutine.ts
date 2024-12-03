import { HarmonyWebsocketConnection } from './HarmonyWebsocketConnection'
import { receivePeerConnection } from './receivePeerConnection'
import { HarmonyRoutineParams } from './routine'

/**
 * any incoming transaction socket initiated by the server gets routed through here.
 * This routes it to the correct routine (there is currently only server-initiated routine, receiveConnectionRequest)
 */
export async function masterRoutine(
  con: HarmonyWebsocketConnection,
  { send, recv }: HarmonyRoutineParams
) {
  let firstMsg: {
    initiate: string
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
