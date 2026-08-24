import {
  base64RegexString,
  HarmonyError,
  importPublicKey,
  rfc3339TimePattern,
  signatureIsValid
} from 'node-harmonyclient'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { stringify } from 'querystring'
import { DateTime } from 'luxon'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    payload: {
      type: 'object',
      properties: {
        ECDHPublicKey: {
          type: 'string',
          pattern: base64RegexString
        },
        toPk: {
          type: 'string'
        },
        purpose: {
          const: 'getECDHPublicKey'
        },
        expires: {
          type: 'string',
          pattern: rfc3339TimePattern
        }
      },
      required: ['ECDHPublicKey', 'toPk', 'purpose', 'expires'],
      additionalProperties: false
    },
    signature: {
      type: 'string',
      pattern: base64RegexString
    }
  },
  required: ['payload', 'signature'],
  additionalProperties: false
} as const
export async function sendGetECDHPublicKey(fch: FriendConnectionHandler) {
  return await fch.controlChannelTransactionHandler.launchRoutine(async (_, { send, recv }) => {
    if (!fch.con.keyPair) {
      throw new Error()
    }

    await send({ initiate: 'getECDHPublicKey' })

    const { payload, signature } = await recv(schema)

    const now = DateTime.now()

    const peerPublicKey = await importPublicKey(fch.friend.peerPk)
    if (!signatureIsValid(peerPublicKey, stringify(payload), signature)) {
      throw new HarmonyError("Peer's signature is invalid")
    }
    if (payload.toPk != fch.con.keyPair.publicKey) {
      throw new HarmonyError("Peer's recipient public key is incorrect")
    }
    const expires = DateTime.fromISO(payload.expires)
    if (!expires.isValid) {
      throw new HarmonyError("Peer's expiry date is invalid: " + expires.invalidReason)
    }
    if (now > expires) {
      throw new HarmonyError("Peer's signature has expired")
    }

    const peerECDHPublicKey = Buffer.from(payload.ECDHPublicKey, 'base64')

    await send({ terminate: 'done' })

    return peerECDHPublicKey
  })
}
