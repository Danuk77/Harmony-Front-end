import { DateTime } from 'luxon'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { getDiffieHellman } from 'crypto'
import {
  base64RegexString,
  HarmonyError,
  importPrivateKey,
  importPublicKey,
  rfc3339TimePattern,
  signatureIsValid,
  signWithPrivateKey
} from 'node-harmonyclient'
import { stringify } from 'canonical-json'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    payload: {
      type: 'object',
      properties: {
        B: {
          type: 'string',
          pattern: base64RegexString
        },
        toPk: {
          type: 'string'
        },
        purpose: {
          const: 'setupEncryption-Response'
        },
        expires: {
          type: 'string',
          pattern: rfc3339TimePattern
        }
      },
      required: ['B', 'toPk', 'purpose', 'expires'],
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

/**
 *
 * @param fch
 * @returns a shared secret
 */
export async function sendSetupEncryption(fch: FriendConnectionHandler) {
  return await fch.controlChannelTransactionHandler.launchRoutine(async (_, { send, recv }) => {
    if (!fch.con.keyPair) {
      throw new Error('No key pair')
    }

    // modp14 - use predetermined prime and generator
    const dh = getDiffieHellman('modp14')
    dh.generateKeys()

    const payload = {
      A: dh.getPublicKey().toString('base64'),
      toPk: fch.friend.peerPk,
      purpose: 'setupEncryption-Request',
      expires: DateTime.now().plus({ seconds: 10 }).toISO()
    }

    const privateKey = await importPrivateKey(fch.con.keyPair.privateKey)
    const signature = await signWithPrivateKey(privateKey, stringify(payload))

    await send({
      initiate: 'setupEncryption',
      payload,
      signature
    })

    const response = await recv(schema)

    const peerPublicKey = await importPublicKey(fch.friend.peerPk)
    if (!signatureIsValid(peerPublicKey, stringify(response.payload), response.signature)) {
      throw new HarmonyError("Peer's signature is invalid")
    }
    if (payload.toPk != fch.con.keyPair.publicKey) {
      throw new HarmonyError("Peer's recipient public key is incorrect")
    }
    const expires = DateTime.fromISO(response.payload.expires)
    if (!expires.isValid) {
      throw new HarmonyError("Peer's expiry date is invalid: " + expires.invalidReason)
    }
    if (DateTime.now() > expires) {
      throw new HarmonyError("Peer's signature has expired")
    }

    let B: Buffer<ArrayBuffer>
    try {
      B = Buffer.from(response.payload.B, 'base64')
    } catch {
      throw new HarmonyError('B is not valid base64')
    }

    const secret = dh.computeSecret(B)
    await send({ terminate: 'done' })
    return secret
  })
}
