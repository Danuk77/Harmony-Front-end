import {
  HarmonyError,
  base64RegexString,
  HarmonyRoutineParams,
  rfc3339TimePattern,
  importPublicKey,
  signatureIsValid,
  signWithPrivateKey,
  importPrivateKey
} from 'node-harmonyclient'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
import { validator } from './masterRoutine'
import { FromSchema } from 'json-schema-to-ts'
import { getDiffieHellman } from 'crypto'
import { DateTime } from 'luxon'
import { stringify } from 'canonical-json'

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      const: 'setupEncryption'
    },
    payload: {
      type: 'object',
      properties: {
        A: {
          type: 'string',
          pattern: base64RegexString
        },
        toPk: {
          type: 'string'
        },
        purpose: {
          const: 'setupEncryption-Request'
        },
        expires: {
          type: 'string',
          pattern: rfc3339TimePattern
        }
      },
      required: ['A', 'toPk', 'purpose', 'expires'],
      additionalProperties: false
    },
    signature: {
      type: 'string',
      pattern: base64RegexString
    }
  },
  required: ['initiate', 'payload', 'signature'],
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

export async function receiveSetupEncryption(
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

  const received = firstMsg as FromSchema<typeof initiateSchema>

  const now = DateTime.now()

  if (
    !(await signatureIsValid(
      await importPublicKey(fch.friend.peerPk),
      stringify(received.payload),
      received.signature
    ))
  ) {
    throw new HarmonyError("Peer's signature is invalid")
  }
  if (received.payload.toPk != fch.con.keyPair?.publicKey) {
    throw new HarmonyError("Peer's recipient public key is incorrect")
  }
  const expires = DateTime.fromISO(received.payload.expires)
  if (!expires.isValid) {
    throw new HarmonyError("Peer's expiry date is invalid: " + expires.invalidReason)
  }
  if (now > expires) {
    throw new HarmonyError("Peer's signature has expired")
  }
  let A: Buffer
  try {
    A = Buffer.from(received.payload.A, 'base64')
  } catch {
    throw new HarmonyError("Peer's Diffie-Hellman public key was not provided in valid base64")
  }

  const dh = getDiffieHellman('modp14')
  dh.generateKeys()
  const secret = dh.computeSecret(A)

  const payload = {
    B: dh.getPublicKey(),
    toPk: fch.friend.peerPk,
    purpose: 'setupEncryption-Response',
    expires: DateTime.now().plus({ seconds: 10 }).toISO()
  }
  const signature = await signWithPrivateKey(
    await importPrivateKey(fch.con.keyPair.privateKey),
    stringify(payload)
  )

  await send({ payload, signature })
  await recv(terminateSchema)
  return secret
}
