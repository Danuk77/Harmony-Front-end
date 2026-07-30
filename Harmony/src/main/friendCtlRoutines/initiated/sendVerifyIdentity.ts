import { randomBytes, webcrypto } from 'crypto'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import {
  base64RegexString,
  importPublicKey,
  rfc3339TimePattern,
  signatureIsValid
} from 'node-harmonyclient'
import { stringify } from 'canonical-json'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    payload: {
      type: 'object',
      properties: {
        challenge: {
          type: 'string'
        },
        publicKey: {
          type: 'string'
        },
        purpose: {
          const: 'verifyIdentity'
        },
        currentTime: {
          type: 'string',
          pattern: rfc3339TimePattern
        }
      },
      required: ['challenge', 'publicKey', 'purpose', 'currentTime'],
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

export async function sendVerifyIdentity(fch: FriendConnectionHandler) {
  return await fch.controlChannelTransactionHandler.launchRoutine(async (_, { send, recv }) => {
    const challenge = randomBytes(50).toString('base64')

    await send({
      initiate: 'verifyIdentity',
      challenge
    })

    const localTime = Date.now()
    const { payload, signature } = await recv(schema)

    if (payload.challenge != challenge) {
      await send({ terminate: 'cancel', error: 'challenge does not match' })
      return false
    }

    if (!fch.con.keyPair) {
      throw new Error()
    }

    if (payload.publicKey != fch.con.keyPair.publicKey) {
      await send({ terminate: 'cancel', error: 'publicKey does not match' })
      return false
    }

    const peerTime = Date.parse(payload.currentTime)
    if (isNaN(peerTime)) {
      await send({ terminate: 'cancel', error: 'could not parse currentTime' })
      return false
    }
    if (Math.abs(localTime - peerTime) > 2000) {
      await send({
        terminate: 'cancel',
        error: 'local and peer time differs by more than 2 seconds'
      })
      return false
    }

    const payloadString = stringify(payload)
    if (!payloadString) {
      throw new Error()
    }

    let peerPk: webcrypto.CryptoKey
    try {
      peerPk = await importPublicKey(fch.friend.peerPk)
    } catch {
      await send({
        terminate: 'cancel',
        error: 'Invalid public key'
      })
      return false
    }
    if (!signatureIsValid(peerPk, payloadString, signature)) {
      await send({
        terminate: 'cancel',
        error: 'Invalid signature'
      })
      return false
    }

    // valid
    await send({ terminate: 'done' })
    return true
  })
}
