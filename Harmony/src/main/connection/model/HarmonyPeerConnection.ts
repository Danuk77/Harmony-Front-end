import { RTCPeerConnection, RTCDataChannel } from '@roamhq/wrtc'

export class HarmonyPeerConnection {
  rtc: RTCPeerConnection
  chatChannel: RTCDataChannel

  constructor(rtc: RTCPeerConnection, chat: RTCDataChannel) {
    this.rtc = rtc
    this.chatChannel = chat
  }
}

// return type of initiatePeerConnection and callback of onIncomingConnectionResult
export type PeerConnectionCreationResult =
  | {
      publicKey: string
      status: 'offline' | 'reject'
      peerConnection?: undefined
      msg?: undefined
    }
  | {
      publicKey: string
      status: 'fail'
      peerConnection?: undefined
      msg: string
    }
  | {
      publicKey: string
      status: 'succeed'
      peerConnection: HarmonyPeerConnection
      msg?: undefined
    }
