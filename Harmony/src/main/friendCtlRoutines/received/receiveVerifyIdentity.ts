import {
  /*HarmonyError,*/ HarmonyRoutineParams,
  importPrivateKey,
  signWithPrivateKey
} from 'node-harmonyclient'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { validator } from './masterRoutine'
import { HarmonyError } from 'node-harmonyclient'
import { FromSchema } from 'json-schema-to-ts'
import { stringify } from 'canonical-json'

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      const: 'verifyIdentity'
    },
    challenge: {
      type: 'string',
      maxLength: 100
    }
  },
  required: ['initiate', 'challenge'],
  additionalProperties: false
} as const

export async function receiveVerifyIdentity(
  fch: FriendConnectionHandler,
  firstMsg: object,
  { send, recv }: HarmonyRoutineParams
) {
  const validationResult = validator.validate(firstMsg, initiateSchema as object)
  if (!validationResult.valid) {
    throw new HarmonyError(
      'Error on incoming message: ' +
        validationResult.errors.map((error) => error.toString()).join(', ')
    )
  }

  const { challenge } = firstMsg as FromSchema<typeof initiateSchema>

  const payload = {
    challenge,
    publicKey: fch.friend.peerPk,
    purpose: 'verifyIdentity',
    currentTime: new Date().toISOString()
  }

  const payloadString = stringify(payload)
  if (!payloadString) throw new Error()

  if (!fch.con.keyPair) {
    throw new Error()
  }
  const privateKey = await importPrivateKey(fch.con.keyPair.privateKey)
  const signature = await signWithPrivateKey(privateKey, payloadString)

  await send({ payload, signature })

  await recv()
  return
}
