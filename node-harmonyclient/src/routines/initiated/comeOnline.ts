import { KeyPair } from '../../utils'
import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { HarmonyError } from '../../model/routine'
import { subtle, webcrypto } from 'node:crypto'

const versionResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    version: { type: 'string' }
  },
  required: ['version'],
  additionalProperties: false
} as const

const signThisResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    signThis: { type: 'string' }
  },
  required: ['signThis'],
  additionalProperties: false
} as const

const welcomeResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    welcome: { type: 'string' },
    terminate: { const: 'done' }
  },
  required: ['welcome', 'terminate'],
  additionalProperties: false
} as const

export async function comeOnline(con: HarmonyWebsocketConnection, keyPair: KeyPair) {
  await con.launchRoutine(
    async (_, { recv, send }) => {
      // initiate routine
      await send({
        initiate: 'comeOnline'
      })

      // recv server version and check number is correct
      const versionResponse = await recv(versionResponseSchema)
      if (versionResponse.version != con.version) {
        await send({
          terminate: 'cancel'
        })
        throw new HarmonyError(
          `Version mismatch: server is version ${versionResponse.version}, client is version ${con.version}`
        )
      }

      // send public key
      await send({
        publicKey: keyPair.publicKey
      })

      const signThisResponse = await recv(signThisResponseSchema)
      const signThis = Buffer.from(signThisResponse.signThis)

      // import private key
      let privateKeyBytes: Buffer
      try {
        privateKeyBytes = Buffer.from(keyPair.privateKey, 'base64')
      } catch {
        throw new HarmonyError('Private key is not valid base64')
      }
      let privateKey: webcrypto.CryptoKey
      try {
        privateKey = await subtle.importKey('pkcs8', privateKeyBytes, 'Ed25519', false, ['sign'])
      } catch {
        throw new HarmonyError(
          'Private key could not be imported. Check that it is an Ed25519 key in PKCS#8+DER+base64 format'
        )
      }

      // sign the message using private key
      const signature = await subtle.sign('Ed25519', privateKey, signThis)
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))

      // send to server
      await send({ signature: signatureBase64 })

      const welcome = await recv(welcomeResponseSchema)
      console.log(welcome.welcome)
    },
    { loginRequired: false }
  )
}
