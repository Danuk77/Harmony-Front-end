import { rtcConfig } from '../../config'
import {
  HarmonyPeerConnection,
  PeerConnectionCreationResult
} from '../../model/HarmonyPeerConnection'
import { HarmonyWebsocketConnection } from '../../model/HarmonyWebsocketConnection'
import { HarmonyRoutineParams } from '../../model/routine'
import { RTCPeerConnection, RTCIceCandidate } from 'werift'

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
    rtc.ondatachannel = (event) => {
      resolve({
        publicKey: peerPk,
        status: 'succeed',
        peerConnection: new HarmonyPeerConnection(rtc, event.channel)
      })
    }
    rtc.onconnectionstatechange = () => {
      if (rtc.connectionState == 'failed') {
        resolve({
          publicKey: peerPk,
          status: 'fail',
          msg: 'WebRTC failed to create a peer connection. Check TURN/STUN servers, NAT settings, etc.'
        })
      }
    }

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
  const peerResponse = (await recv()) as
    | {
        peerStatus: 'offline'
        forwarded: null
        terminate: 'done'
      }
    | {
        peerStatus: 'online'
        forwarded: {
          type: 'reject'
        }
        terminate: 'done'
      }
    | {
        peerStatus: 'online'
        forwarded: {
          type: 'acceptAndOffer'
          payload: {
            type: 'offer'
            sdp: string
          }
        }
      }

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
  rtc.setConfiguration(rtcConfig)
  await rtc.setRemoteDescription(peerResponse.forwarded.payload)
  const rtcAnswer = await rtc.createAnswer()
  await send({
    forward: {
      type: 'answer',
      payload: rtcAnswer
    }
  })
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
  await rtc.setLocalDescription(rtcAnswer)

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
    const candidate = new RTCIceCandidate(recvCandidate.forwarded.payload)
    await rtc.addIceCandidate(candidate)
  }

  // should get a terminate message - end of communication with server
  await recv()

  return 'connect'
}
