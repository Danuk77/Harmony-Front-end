import {
  HarmonyRoutineParams,
  importPrivateKey,
  signWithPrivateKey,
  HarmonyError
} from 'node-harmonyclient'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { validator } from './masterRoutine'
import { DateTime } from 'luxon'
import { stringify } from 'canonical-json'

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      const: 'getECDHPublicKey'
    }
  },
  required: ['initiate'],
  additionalProperties: false
} as const

const terminateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    terminate: {
      const: 'done'
    }
  },
  required: ['terminate'],
  additionalProperties: false
} as const

export async function receiveGetECDHPublicKey(
  fch: FriendConnectionHandler,
  firstMsg: object,
  { send, recv }: HarmonyRoutineParams
) {
  if (!fch.con.keyPair) {
    throw new Error()
  }

  const validationResult = validator.validate(firstMsg, initiateSchema as object)
  if (!validationResult.valid) {
    throw new HarmonyError(
      'Error on incoming message: ' +
        validationResult.errors.map((error) => error.toString()).join(', ')
    )
  }

  const payload = {
    ECDHPublicKey: (await fch.getECDHPublicKey()).toString('base64'),
    toPk: fch.friend.peerPk,
    purpose: 'getECDHPublicKey',
    expires: DateTime.now().plus({ seconds: 10 }).toISO()
  }

  const signature = await signWithPrivateKey(
    await importPrivateKey(fch.con.keyPair.privateKey),
    stringify(payload)
  )

  await send({ payload, signature })
  await recv(terminateSchema)
  fch.confirmPeerHasReceivedDHPublicKey()
}
