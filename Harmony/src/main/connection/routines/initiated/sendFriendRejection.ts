import { eToStr } from '../../../Controller'
import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'

type FriendRejectionResult =
  | {
      status: 'fail'
      msg: string
    }
  | {
      status: 'offline' | 'succeed'
      msg?: undefined
    }

const responseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    peerStatus: {
      enum: ['offline', 'online']
    },
    terminate: {
      const: 'done'
    }
  },
  additionalProperties: false,
  required: ['peerStatus', 'terminate']
} as const

/**
 * Sends a friend rejection to a peer and returns the result
 * @param con websocket connection to use
 * @param peerPk public key of peer
 * @returns type FriendRejectionResult =
 an object that contains the result
 */
export function sendFriendRejection(
  con: HarmonyWebsocketConnection,
  peerPk: string
): Promise<FriendRejectionResult> {
  return new Promise<FriendRejectionResult>((resolve) => {
    con
      .launchRoutine(async ({ send, recv }): Promise<{ status: 'offline' | 'succeed' }> => {
        // send friend rejection
        await send({
          initiate: 'sendFriendRejection',
          key: peerPk
        })

        // get response
        const resp = await recv(responseSchema)

        // process response
        switch (resp.peerStatus) {
          case 'offline':
            return {
              status: 'offline'
            }
          case 'online':
            return {
              status: 'succeed'
            }
        }
      })
      .then((result) => {
        resolve(result)
      })
      .catch((reason) => {
        resolve({
          status: 'fail',
          msg: eToStr(reason)
        })
      })
  })
}
