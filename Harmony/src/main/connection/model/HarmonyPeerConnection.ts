import { RTCPeerConnection, RTCDataChannel } from '@roamhq/wrtc'

export class HarmonyPeerConnection {
  rtc: RTCPeerConnection
  chat: RTCDataChannel

  constructor(rtc: RTCPeerConnection, chat: RTCDataChannel) {
    this.rtc = rtc
    this.chat = chat
  }
}

// return type of initiatePeerConnection and callback of onIncomingConnectionResult
export type PeerConnectionCreationResult =
  | {
      status: 'offline' | 'reject'
      peerConnection?: undefined
      msg?: undefined
    }
  | {
      status: 'fail'
      peerConnection?: undefined
      msg: string
    }
  | {
      status: 'succeed'
      peerConnection: HarmonyPeerConnection
      msg?: undefined
    }
