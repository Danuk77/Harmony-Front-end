import {
  FriendRequestResponseType,
  HarmonyWebsocketConnection
} from '../../model/HarmonyWebsocketConnection'
import { offlineResponseSchema } from './initiatePeerConnection'

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

const onlineResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    peerStatus: {
      const: 'online'
    },
    forwarded: {
      type: 'object',
      properties: {
        type: {
          enum: ['accept', 'reject', 'pending']
        }
      },
      required: ['type'],
      additionalProperties: false
    } as const,
    terminate: {
      const: 'done'
    }
  },
  required: ['peerStatus', 'forwarded', 'terminate'],
  additionalProperties: false
} as const

const responseSchema = {
  oneOf: [offlineResponseSchema, onlineResponseSchema]
} as const

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

        const resp = await recv(responseSchema)

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
