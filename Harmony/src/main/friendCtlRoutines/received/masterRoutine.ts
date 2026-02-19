import { HarmonyRoutineParams } from 'node-harmonyclient/build/model/routine'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { FromSchema } from 'json-schema-to-ts'
import { eToStr } from '../../../common/utils'
import { Validator } from 'jsonschema'
import { receiveVideoCallRequest } from './receiveVideoCallRequest'

export const validator = new Validator()

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      enum: ['videoCallRequest']
    }
  },
  required: ['initiate']
} as const

export async function masterRoutine(
  fch: FriendConnectionHandler,
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
    case 'videoCallRequest': {
      await receiveVideoCallRequest(fch, firstMsg, { send, recv })
      break
    }
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
