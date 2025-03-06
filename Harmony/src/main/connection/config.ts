/** @todo replace werift with node-datachannel */
/* werift appears to have Google's stun server hard-coded if you don't provide one */

import { PeerConfig } from 'werift'

export const rtcConfig: Partial<PeerConfig> = {
  iceServers: [
    /**the user's ice servers are appended to this list */
  ],

  iceTransportPolicy: 'all'
}
