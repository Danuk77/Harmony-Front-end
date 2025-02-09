import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { HarmonyError } from '../../model/routine'

const versionResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    version: { type: 'string' }
  },
  required: ['version'],
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

export async function comeOnline(con: HarmonyWebsocketConnection, publicKey: string) {
  await con.launchRoutine(
    async ({ recv, send }) => {
      await send({
        initiate: 'comeOnline'
      })

      // check that version number is correct
      const version = await recv(versionResponseSchema)
      if (version.version != con.version) {
        await send({
          terminate: 'cancel'
        })
        throw new HarmonyError(
          `Version mismatch: server is version ${version.version}, client is version ${con.version}`
        )
      }
      await send({
        publicKey: publicKey
      })
      const welcome = await recv(welcomeResponseSchema)
      console.log(welcome.welcome)
    },
    { loginRequired: false }
  )
}
