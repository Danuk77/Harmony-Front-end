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
    return new Promise<void>((resolve) => {
      this.chatChannel.close()
      this.ctlChannel.close()

      // werift bug I think. RTCDataChannel channel closes don't arrive to peer if we don't wait for a bit here.
      setTimeout(() => {
        this.rtc.close()
        this.removeAllListeners()
        resolve()
      }, 10)
    })
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
