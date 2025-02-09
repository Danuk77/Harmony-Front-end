import { PeerConfig } from 'werift'

export const rtcConfig: Partial<PeerConfig> = {
  iceServers: [
    {
      urls: 'stun:stun1.1.google.com:19302'
    },
    {
      urls: 'stun:stun2.1.google.com:19302'
    },
    {
      urls: 'stun:stun.ekiga.net:3478'
    }
  ],

  iceTransportPolicy: 'all'
}
