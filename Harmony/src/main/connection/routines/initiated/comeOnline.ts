import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { HarmonyError } from '../../model/routine'

export async function comeOnline(con: HarmonyWebsocketConnection, publicKey: string) {
  await con.launchRoutine(
    async ({ recv, send }) => {
      await send({
        initiate: 'comeOnline'
      })

      // check that version number is correct
      const version = (await recv()) as {
        version: string
      }
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
      const welcome = (await recv()) as {
        welcome: string
        terminate: string
      }
      console.log(welcome.welcome)
    },
    { loginRequired: false }
  )
}
