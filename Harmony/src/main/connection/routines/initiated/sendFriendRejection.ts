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
        const resp = (await recv()) as {
          peerStatus: 'offline' | 'online'
          terminate: 'done'
        }

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
          msg: (reason as Error).message
        })
      })
  })
}
