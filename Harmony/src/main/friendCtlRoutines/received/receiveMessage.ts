import { /*HarmonyError,*/ HarmonyRoutineParams } from 'node-harmonyclient'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { validator } from './masterRoutine'
import { HarmonyError } from 'node-harmonyclient/build/model/routine'
import { FromSchema } from 'json-schema-to-ts'

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      const: 'message'
    },
    message: {
      type: 'string'
    },
    number: {
      type: 'number'
    }
  },
  required: ['initiate', 'message', 'number'],
  additionalProperties: false
} as const

export async function receiveMessage(
  fch: FriendConnectionHandler,
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

  const { message, number } = firstMsg as FromSchema<typeof initiateSchema>

  await fch.onReceiveMessage(message, number)

  await send({ terminate: 'done' })
}
