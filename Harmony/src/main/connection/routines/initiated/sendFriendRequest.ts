import {
  FriendRequestResponseType,
  HarmonyWebsocketConnection
} from '../../model/HarmonyWebsocketConnection'

export type FriendRequestResult =
  | {
      status: 'fail'
      type?: undefined
      msg: string
    }
  | {
      status: 'offline'
      type?: undefined
      msg?: undefined
    }
  | {
      status: 'succeed'
      type: FriendRequestResponseType
      msg?: undefined
    }

/**
 * Sends a friend request to a peer and returns the result
 * @param con websocket connection to use
 * @param peerPk public key of peer
 * @returns FriendRequestResult an object that contains the result
 */
export function sendFriendRequest(
  con: HarmonyWebsocketConnection,
  peerPk: string
): Promise<FriendRequestResult> {
  return new Promise<FriendRequestResult>((resolve) => {
    con
      .launchRoutine<FriendRequestResult>(async ({ send, recv }) => {
        // send friend request
        await send({
          initiate: 'sendFriendRequest',
          key: peerPk
        })

        // give correct type to incoming message
        const resp = (await recv()) as
          | {
              peerStatus: 'offline'
              forwarded: null
              terminate: 'done'
            }
          | {
              peerStatus: 'online'
              forwarded: {
                type: 'accept' | 'reject' | 'pending'
              }
              terminate: 'done'
            }

        switch (resp.peerStatus) {
          case 'offline':
            return {
              status: 'offline'
            }
          case 'online':
            return {
              status: 'succeed',
              type: resp.forwarded.type
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
