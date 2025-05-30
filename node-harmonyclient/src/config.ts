import { PeerConfig } from 'werift'

export const rtcConfig: Partial<PeerConfig> = {
  iceServers: [
    /**the user's ice servers are appended to this list */
  ],

  iceTransportPolicy: 'all'
}
