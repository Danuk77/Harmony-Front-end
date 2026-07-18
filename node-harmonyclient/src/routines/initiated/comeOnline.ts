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

      // check versions are compatible. Either:
      // versions are the same, OR
      // server is no more than one major version ahead
      const serverVersionParts = versionResponse.version.split('.')
      const clientVersionParts = con.serverAPIVersion.split('.')

      const versionsAreCompatible = (() => {
        const majorDiff = parseInt(serverVersionParts[0]) - parseInt(clientVersionParts[0])
        if (majorDiff != 0) {
          return false
        }
        for (let i = 1; i < Math.max(serverVersionParts.length, clientVersionParts.length); i++) {
          if (i >= clientVersionParts.length) {
            // e.g. server=1.x, client=1
            return true
          }
          if (i >= serverVersionParts.length) {
            // e.g. server=1, client=1.x
            return false
          }
          const minorDiff = parseInt(clientVersionParts[i]) - parseInt(serverVersionParts[i])
          if (isNaN(minorDiff)) {
            return false
          }
          if (minorDiff < 0) {
            // e.g. server=1.2.x, client=1.1.y
            return true
          }
          if (minorDiff > 0) {
            // e.g. server=1.1.x, client=1.2.y
            return false
          }
          // otherwise refer to sub-version
        }
        return true
      })()

      if (!versionsAreCompatible) {
        await send({
          terminate: 'cancel'
        })
        throw new HarmonyError(
          `Incompatible server api version: server uses version ${versionResponse.version}, client uses version ${con.serverAPIVersion}`
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
