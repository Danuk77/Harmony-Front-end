import { RTCPeerConnection, RTCDataChannel } from 'werift'

export class HarmonyPeerConnection {
  rtc: RTCPeerConnection
  chatChannel: RTCDataChannel
  ctlChannel: RTCDataChannel

  constructor(rtc: RTCPeerConnection, chat: RTCDataChannel, ctl: RTCDataChannel) {
    this.rtc = rtc
    this.chatChannel = chat
    this.ctlChannel = ctl
  }

  removeAllListeners() {
    this.chatChannel.stateChanged.allUnsubscribe()
    this.ctlChannel.stateChanged.allUnsubscribe()
    this.rtc.connectionStateChange.allUnsubscribe()
    this.chatChannel.onMessage.allUnsubscribe()
    this.ctlChannel.onMessage.allUnsubscribe()
  }

  close() {
    this.chatChannel.close()
    this.ctlChannel.close()
    this.rtc.close()
    this.removeAllListeners()
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
