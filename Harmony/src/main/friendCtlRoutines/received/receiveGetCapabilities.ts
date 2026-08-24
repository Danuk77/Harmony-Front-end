import { HarmonyRoutineParams } from 'node-harmonyclient'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { validator } from './masterRoutine'
import { HarmonyError } from 'node-harmonyclient'
import { capabilities } from '../capabilities'

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      const: 'getCapabilities'
    }
  },
  required: ['initiate'],
  additionalProperties: false
} as const

export async function receiveGetCapabilities(
  _: FriendConnectionHandler,
  firstMsg: object,
  { send }: HarmonyRoutineParams
) {
  const validationResult = validator.validate(firstMsg, initiateSchema as object)
  if (!validationResult.valid) {
    throw new HarmonyError(
      'Error on incoming message: ' +
        validationResult.errors.map((error) => error.toString()).join(', ')
    )
  }

  await send({ capabilities, terminate: 'done' })
}
