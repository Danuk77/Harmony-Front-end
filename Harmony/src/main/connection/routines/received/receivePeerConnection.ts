import { FromSchema } from 'json-schema-to-ts'
import { rtcConfig } from '../../config'
import {
  HarmonyPeerConnection,
  PeerConnectionCreationResult
} from '../../model/HarmonyPeerConnection'
import { HarmonyWebsocketConnection, validator } from '../../model/HarmonyWebsocketConnection'
import { HarmonyError, HarmonyRoutineParams } from '../../model/routine'
import { RTCIceCandidate, RTCPeerConnection } from 'werift'
import { iceCandidateSchema } from '../initiated/initiatePeerConnection'

const initiateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    initiate: {
      const: 'receiveConnectionRequest'
    },
    key: {
      type: 'string',
      pattern: '^[0123456789abcdef]{128}$'
    }
  },
  required: ['initiate', 'key'],
  additionalProperties: false
} as const

const answerSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    forwarded: {
      type: 'object',
      properties: {
        type: {
          const: 'answer'
        },
        payload: {
          type: 'object',
          properties: {
            type: {
              const: 'answer'
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
  required: ['forwarded'],
  additionalProperties: false
} as const

/**
 * The non-initiator peer in the `establishConnectionToPeer` routine.
 * Called by the master routine when a new transaction socket is received with "initiate":"receiveConnectionRequest"
 * This function uses 2 callbacks on the `con` object:
 * `con.onIncomingConnectionRequest`, and `con.onIncomingConnectionResult`,
 * the former of which determines whether the connection should be accepted or rejected, and the latter of which delivers the result in the accept case.
 */
export async function receivePeerConnection(
  con: HarmonyWebsocketConnection,
  firstMsg: object,
  { send, recv }: HarmonyRoutineParams
) {
  // this function needs to wait until all messages on the routine have been sent/received, in order to prevent the transaction socket being deleted. Wait until a `done` callback is called.
  await new Promise<void>((done) => {
    // validate first message against schema
    const validationResult = validator.validate(firstMsg, initiateSchema as object)
    if (!validationResult.valid) {
      throw new HarmonyError(
        'Error on incoming message: ' +
          validationResult.errors.map((error) => error.toString()).join(', ')
      )
    }

    const peerPk = (firstMsg as FromSchema<typeof initiateSchema>).key
    // wrap all the cases for the PeerConnectionCreationResult in a promise. Promises can only be resolved once, so this ensures at most one onIncomingConnectionResult event is fired.
    // the `done` promise is separate to this.
    new Promise<PeerConnectionCreationResult>((resolve) => {
      const rtc = new RTCPeerConnection()
      // create data channel
      const dataChannel = rtc.createDataChannel('chat', { ordered: true })
      // resolve promise when channel opens
      dataChannel.stateChanged.subscribe((state) => {
        if (state == 'open') {
          resolve({
            publicKey: peerPk,
            status: 'succeed',
            peerConnection: new HarmonyPeerConnection(rtc, dataChannel)
          })
        }
      })

      // attempt to connect the data channel with wth peer
      setupReceivedPeerConnection(rtc, con, firstMsg, { send, recv })
        .then((status) => {
          if (status == 'reject') {
            resolve({
              publicKey: peerPk,
              status: 'reject'
            })
            done()
          }
        })
        .catch((reason) => {
          resolve({
            publicKey: peerPk,
            status: 'fail',
            msg: (reason as Error).message
          })
          done()
        })
    }).then((result) => {
      // result is one of a few cases.
      if (result.status != 'reject') {
        // ignore reject case. onIncomingConnectionRequest was already fired about this connection, so the user has already explicitly accepted or rejected this connection request.
        con.onIncomingConnectionResult?.(result)
      }
    })
  })
}

async function setupReceivedPeerConnection(
  rtc: RTCPeerConnection,
  con: HarmonyWebsocketConnection,
  firstMsg: object,
  { send, recv }: HarmonyRoutineParams
): Promise<'reject' | 'connect'> {
  const initiateAndKey = firstMsg as {
    initiate: 'receiveConnectionRequest'
    key: string
  }

  /**@todo check the user's friend list to see if they can connect to this peer */
  const acceptOrReject = (await con.onIncomingConnectionRequest?.(initiateAndKey.key)) ?? 'reject'

  // reject non-friends
  if (acceptOrReject == 'reject') {
    await send({
      forward: {
        type: 'reject'
      }
    })
    await recv() // terminate:"done"
    return 'reject'
  }

  // accept
  rtc.setConfiguration(rtcConfig)

  const localDescription = await rtc.createOffer()
  await send({
    forward: {
      type: 'acceptAndOffer',
      payload: {
        type: localDescription.type,
        sdp: localDescription.sdp
      }
    }
  })

  const peerReply = await recv(answerSchema)

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

  await rtc.setLocalDescription(localDescription)
  await rtc.setRemoteDescription(peerReply.forwarded.payload)

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
