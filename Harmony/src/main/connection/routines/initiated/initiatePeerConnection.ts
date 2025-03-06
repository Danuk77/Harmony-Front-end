import { FromSchema } from 'json-schema-to-ts'
import { rtcConfig } from '../../config'
import {
  HarmonyPeerConnection,
  PeerConnectionCreationResult
} from '../../model/HarmonyPeerConnection'
import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { HarmonyRoutineParams } from '../../model/routine'
import { RTCPeerConnection, RTCIceCandidate } from 'werift'
import { store } from '../../../redux'

// export this cos it's reused in sendFriendRequest
export const offlineResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    peerStatus: {
      const: 'offline'
    },
    forwarded: {
      const: null
    },
    terminate: {
      const: 'done'
    }
  },
  required: ['peerStatus', 'forwarded', 'terminate'],
  additionalProperties: false
} as const

const rejectResponseSchema = {
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
          const: 'reject'
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

const acceptAndOfferResponseSchema = {
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
          const: 'acceptAndOffer'
        },
        payload: {
          type: 'object',
          properties: {
            type: {
              const: 'offer'
            },
            sdp: {
              type: 'string'
            }
          },
          required: ['type', 'sdp'],
          additionalProperties: false
        } as const
      },
      required: ['type', 'payload'],
      additionalProperties: false
    } as const
  },
  required: ['peerStatus', 'forwarded'],
  additionalProperties: false
} as const

const peerResponseSchema = {
  oneOf: [offlineResponseSchema, rejectResponseSchema, acceptAndOfferResponseSchema]
} as const

export const iceCandidateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    forwarded: {
      type: 'object',
      properties: {
        type: {
          const: 'ICECandidate'
        },
        payload: {
          type: 'object',
          properties: {
            candidate: {
              type: 'string'
            },
            sdpMLineIndex: {
              type: 'integer'
            },
            sdpMid: {
              type: 'string'
            },
            usernameFragment: {
              type: 'string'
            }
          },
          required: ['candidate', 'sdpMLineIndex'],
          additionalProperties: false
        } as const
      },
      required: ['type', 'payload'],
      additionalProperties: false
    } as const
  },
  required: ['forwarded'],
  additionalProperties: false
} as const

/**
 * Create a WebRTC connection with a peer with public key `peerPk`.
 * This is the initiator side of the `establishConnectionToPeer` routine
 * @param con
 * @param peerPk
 * @returns
 */
export function initiatePeerConnection(
  con: HarmonyWebsocketConnection,
  peerPk: string
): Promise<PeerConnectionCreationResult> {
  const rtc = new RTCPeerConnection()

  // the connection has been successfully created when we get an event on the .ondatachannel channel
  // but the connection can fail for a number of reasons
  // wrap everything in a promise
  return new Promise<PeerConnectionCreationResult>((resolve) => {
    rtc.onDataChannel.subscribe((channel) => {
      resolve({
        publicKey: peerPk,
        status: 'succeed',
        peerConnection: new HarmonyPeerConnection(rtc, channel)
      })
    })
    rtc.connectionStateChange.subscribe((state) => {
      if (state == 'failed') {
        resolve({
          publicKey: peerPk,
          status: 'fail',
          msg: 'WebRTC failed to create a peer connection. Check TURN/STUN servers, NAT settings, etc.'
        })
      }
    })

    // setup the rtc connection using the signalling server
    con
      .launchRoutine(({ send, recv }) => setupInitiatedPeerConnection(rtc, peerPk, { send, recv }))
      .then((status) => {
        if (status == 'offline' || status == 'reject') {
          resolve({
            publicKey: peerPk,
            status: status
          })
        }
      })
      .catch((e) =>
        resolve({
          publicKey: peerPk,
          status: 'fail',
          msg: (e as Error).message
        })
      )
  })
}

/**
 * Handes client-server communication to set up a p2p connection
 */
async function setupInitiatedPeerConnection(
  rtc: RTCPeerConnection,
  peerPk: string,
  { send, recv }: HarmonyRoutineParams
): Promise<'offline' | 'reject' | 'connect'> {
  await send({
    initiate: 'sendConnectionRequest',
    key: peerPk
  })
  // response with union type of 3 cases
  const peerResponse = await recv(peerResponseSchema)

  if (peerResponse.peerStatus == 'offline') {
    console.log('Peer is offline')
    return 'offline'
  }
  if (peerResponse.forwarded.type == 'reject') {
    console.log('Peer rejects connection request')
    return 'reject'
  }
  // only remains accept and offer case.
  // peerResponse is typed correctly :)
  await rtc.setRemoteDescription(peerResponse.forwarded.payload)
  // prepend user's ice servers.
  const iceServers = store.getState().user.iceServers
  rtc.setConfiguration({
    ...rtcConfig,
    iceServers: [...iceServers, ...(rtcConfig.iceServers ?? [])]
  })
  const rtcAnswer = await rtc.createAnswer()
  await send({
    forward: {
      type: 'answer',
      payload: rtcAnswer
    }
  })
  rtc.onIceCandidate.subscribe(async (candidate) => {
    if (candidate) {
      try {
        await send({
          forward: {
            type: 'ICECandidate',
            payload: {
              candidate: candidate.candidate,
              sdpMLineIndex: candidate.sdpMLineIndex,
              sdpMid: candidate.sdpMid,
              usernameFragment: candidate.usernameFragment
            }
          }
        })
      } catch {
        console.error('failed to send ICE candidate')
      }
    }
  })
  await rtc.setLocalDescription(rtcAnswer)

  // keep waiting to receive candidates until one with an empty candidate field is received
  let recvCandidate: FromSchema<typeof iceCandidateSchema>
  while ((recvCandidate = await recv(iceCandidateSchema)).forwarded.payload.candidate != '') {
    const candidate = new RTCIceCandidate(recvCandidate.forwarded.payload)
    await rtc.addIceCandidate(candidate)
  }

  // should get a terminate message - end of communication with server
  await recv()

  return 'connect'
}
