import { HarmonyRoutineParams } from 'node-harmonyclient'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { FromSchema } from 'json-schema-to-ts'
import { assertNever, eToStr } from '../../../common/utils'
import { Validator } from 'jsonschema'
import { receiveVideoCallRequest } from './receiveVideoCallRequest'
import { receiveMessage } from './receiveMessage'
import { receiveVerifyIdentity } from './receiveVerifyIdentity'

export const validator = new Validator()

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      enum: ['videoCallRequest', 'message', 'verifyIdentity']
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
    case 'message': {
      await receiveMessage(fch, firstMsg, { send, recv })
      break
    }
    case 'verifyIdentity': {
      await receiveVerifyIdentity(fch, firstMsg, { send, recv })
      break
    }
    default:
      assertNever(firstMsg.initiate)
  }
}
