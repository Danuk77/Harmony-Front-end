import { FromSchema } from 'json-schema-to-ts'
import { HarmonyWebsocketConnection, validator } from '../../model/HarmonyWebsocketConnection'
import { HarmonyError } from '../../model/routine'
import { base64RegexString } from '../../utils'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      const: 'receiveFriendRejection'
    },
    terminate: {
      const: 'done'
    },
    key: {
      type: 'string',
      pattern: base64RegexString
    }
  },
  additionalProperties: false,
  required: ['initiate', 'terminate', 'key']
} as const

/**
 * Called by the master routine when a new transaction socket is received with "initiate":"receiveFriendRejection"
 * Calls the callback con.onReceiveFriendRejection.
 */
export async function receiveFriendRejection(con: HarmonyWebsocketConnection, firstMsg: object) {
  // validate first message against schema
  const validationResult = validator.validate(firstMsg, schema as object)
  if (!validationResult.valid) {
    throw new HarmonyError(
      'Error on incoming message: ' +
        validationResult.errors.map((error) => error.toString()).join(', ')
    )
  }

  const firstMsgTyped = firstMsg as FromSchema<typeof schema>
  con.onReceiveFriendRejection?.(firstMsgTyped.key)
}
