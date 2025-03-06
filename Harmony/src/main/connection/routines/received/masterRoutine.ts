import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { receiveFriendRequest } from './receiveFriendRequest'
import { receivePeerConnection } from './receivePeerConnection'
import { HarmonyRoutineParams } from '../../model/routine'
import { receiveFriendRejection } from './receiveFriendRejection'
import { FromSchema } from 'json-schema-to-ts'
import { eToStr } from '../../../Controller'

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      enum: ['receiveConnectionRequest', 'receiveFriendRequest', 'receiveFriendRejection']
    }
  },
  required: ['initiate']
} as const

/**
 * any incoming transaction socket initiated by the server gets routed through here.
 */
export async function masterRoutine(
  con: HarmonyWebsocketConnection,
  { send, recv }: HarmonyRoutineParams
) {
  let firstMsg: FromSchema<typeof initiateSchema>
  try {
    firstMsg = await recv(initiateSchema)
  } catch (e) {
    console.error(eToStr(e))
    return
  }

  switch (firstMsg.initiate) {
    case 'receiveConnectionRequest':
      await receivePeerConnection(con, firstMsg, { send, recv })
      break
    case 'receiveFriendRequest':
      await receiveFriendRequest(con, firstMsg, { send, recv })
      break
    case 'receiveFriendRejection':
      await receiveFriendRejection(con, firstMsg)
      break
    default:
      try {
        await send({
          terminate: 'cancel'
        })
      } catch {
        //
      }
      console.error('unknown incoming routine: ' + firstMsg.initiate)
  }
}
