import { rtcConfig } from './config'
import { HarmonyPeerConnection, PeerConnectionCreationResult } from './HarmonyPeerConnection'
import { HarmonyWebsocketConnection } from './HarmonyWebsocketConnection'
import { HarmonyRoutineParams } from './routine'
import { RTCPeerConnection } from '@roamhq/wrtc'

/**
 * The non-initiator peer in the `establishConnectionToPeer` routine.
 * Unlike initiated peer connections, this function fires a callback instead of returning the peer connection.
 * The callback is con.onIncomingConnectionResult?.(result)
 * @param firstMsg
 * @param param1
 * @returns
 */
export async function receivePeerConnection(
  con: HarmonyWebsocketConnection,
  firstMsg: object,
  { send, recv }: HarmonyRoutineParams
) {
  // this function needs to wait until the routine is done. Wait until a `done` callback is called.
  await new Promise<void>((done) => {
    // wrap all the cases for the PeerConnectionCreationResult in a promise. Promises can only be resolved once, so this ensures at most one onIncomingConnectionResult event is fired.
    // the `done` promise is separate to this.
    new Promise<PeerConnectionCreationResult>((resolve) => {
      const rtc = new RTCPeerConnection()
      // create data channel
      const dataChannel = rtc.createDataChannel('chat', { ordered: true })
      dataChannel.addEventListener('open', () => {
        resolve({
          status: 'succeed',
          peerConnection: new HarmonyPeerConnection(rtc, dataChannel)
        })
      })

      // attempt to connect the data channel with wth peer
      setupReceivedPeerConnection(rtc, con, firstMsg, { send, recv })
        .then((status) => {
          if (status == 'reject') {
            resolve({
              status: 'reject'
            })
            done()
          }
        })
        .catch((reason) => {
          resolve({
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
  const acceptOrReject = con.onIncomingConnectionRequest?.(initiateAndKey.key) ?? 'reject'

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

  const peerReply = (await recv()) as {
    forwarded: {
      type: 'answer'
      payload: {
        type: 'answer'
        sdp: string
      }
    }
  }

  rtc.addEventListener('icecandidate', (event) => {
    if (event.candidate !== null) {
      try {
        send({
          forward: {
            type: 'ICECandidate',
            payload: {
              candidate: event.candidate.candidate,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdpMid: event.candidate.sdpMid,
              usernameFragment: event.candidate.usernameFragment
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
  type recvCandidateType = {
    forwarded: {
      type: 'ICECandidate'
      payload: {
        candidate: string
        sdpMLineIndex: number
        sdpMid: string
        usernameFragment: string
      }
    }
  }
  let recvCandidate: recvCandidateType
  while ((recvCandidate = (await recv()) as recvCandidateType).forwarded.payload.candidate != '') {
    await rtc.addIceCandidate(recvCandidate.forwarded.payload)
  }

  // should get a terminate message - end of communication with server
  await recv()
  return 'connect'
}
