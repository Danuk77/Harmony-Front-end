import { FromSchema } from 'json-schema-to-ts'
import { HarmonyWebsocketConnection, validator } from '../../model/HarmonyWebsocketConnection'
import { HarmonyError, HarmonyRoutineParams } from '../../model/routine'
import { base64RegexString } from '../../utils'

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      const: 'receiveFriendRequest'
    },
    key: {
      type: 'string',
      pattern: base64RegexString
    }
  },
  required: ['initiate', 'key'],
  additionalProperties: false
} as const

/**
 * Called by the master routine when a new transaction socket is received with "initiate":"receiveFriendRequest"
 * Calls the callback con.onReceiveFriendRequest.
 */
export async function receiveFriendRequest(
  con: HarmonyWebsocketConnection,
  firstMsg: object,
  { send, recv }: HarmonyRoutineParams
) {
  // validate first message against schema
  const validationResult = validator.validate(firstMsg, initiateSchema as object)
  if (!validationResult.valid) {
    throw new HarmonyError(
      'Error on incoming message: ' +
        validationResult.errors.map((error) => error.toString()).join(', ')
    )
  }

  const firstMsgTyped = firstMsg as FromSchema<typeof initiateSchema>

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
