import { KeyPair } from '../../utils'
import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { HarmonyError } from '../../model/routine'
import { stringify } from 'canonical-json'
import { importPrivateKey, signWithPrivateKey } from '../../keys'

const versionResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    version: { type: 'string' }
  },
  required: ['version'],
  additionalProperties: false
} as const

const challengeResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    challenge: { type: 'string' }
  },
  required: ['challenge'],
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

      const { challenge } = await recv(challengeResponseSchema)

      const privateKey = await importPrivateKey(keyPair.privateKey)

      // get hostname
      if (!con.serverUrl) {
        await send({ terminate: 'cancel' })
        throw new HarmonyError(`No server URL`)
      }

      let hostname: string
      try {
        hostname = new URL(con.serverUrl).hostname
      } catch {
        await send({ terminate: 'cancel' })
        throw new HarmonyError(`Invalid server address`)
      }

      const payload = {
        challenge: challenge,
        hostname: hostname,
        purpose: 'comeOnline',
        currentTime: new Date().toISOString()
      }

      const stringPayload = stringify(payload)
      if (!stringPayload) {
        throw new Error()
      }

      const signatureBase64 = await signWithPrivateKey(privateKey, stringPayload)

      // send to server
      await send({ payload, signature: signatureBase64 })

      await recv(welcomeResponseSchema)
    },
    { loginRequired: false }
  )
}
