import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { HarmonyRoutineParams } from '../../model/routine'

/**
 * Called by the master routine when a new transaction socket is received with "initiate":"receiveFriendRequest"
 * Calls the callback con.onReceiveFriendRequest.
 */
export async function receiveFriendRequest(
  con: HarmonyWebsocketConnection,
  firstMsg: object,
  { send, recv }: HarmonyRoutineParams
) {
  const firstMsgTyped = firstMsg as {
    initiate: 'receiveFriendRequest'
    key: string
  }

  const shouldAccept = (await con.onReceiveFriendRequest?.(firstMsgTyped.key)) ?? 'no-handler'

  if (shouldAccept == 'no-handler') {
    throw new Error('No handler defined for onReceiveFriendRequest')
  }

  try {
    await send({
      forward: {
        type: shouldAccept
      }
    })
    await recv() // terminate:done
  } catch (e) {
    console.error((e as Error).message)
  }
}
