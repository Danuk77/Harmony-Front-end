import { HarmonyWebsocketConnection } from './connection/HarmonyWebsocketConnection'
import { initiatePeerConnection } from './connection/initiatePeerConnection'

/**
 * connectionTest(0) creates a websocket connection and listens for peers.
 * connectionTest(1) creates a websocket connection and attempts to connect to 0.
 * Both send a message to the other once complete.
 */
export function connectionTest(i: 0 | 1) {
  if (i == 0) {
    const connection = new HarmonyWebsocketConnection(
      'cffd10babed1182e7d8e6cff845767eeae4508aa13cd00379233f57f799dc18c1eefd35b51db36e3da4770737a3f8fe75eda0cd3c48f23ea705f3234b0929f9e'
    )
    connection.startup()

    // accept all incoming connections, ignore pk
    connection.onIncomingConnectionRequest = () => 'accept'

    connection.onIncomingConnectionResult = (result) => {
      switch (result.status) {
        case 'fail':
          console.error(result.msg)
          break
        case 'succeed':
          console.log('connection succeeded')
          result.peerConnection.chat.addEventListener('message', (msg) => {
            console.log('📨 peer: ' + msg.data)
          })
          result.peerConnection.chat.send('Hello there, incoming connection!')
      }
    }
  } else if (i == 1) {
    const connection = new HarmonyWebsocketConnection(
      'cffd10babed1182e7d8e6cff845767eeae4508aa13cd00379233f57f799dc18c1eefd35b51db36e3da4770737a3f8fe75eda0cd3c48f23ea705f3234b0929f9f'
    )
    connection
      .startup()
      .then(() =>
        initiatePeerConnection(
          connection,
          'cffd10babed1182e7d8e6cff845767eeae4508aa13cd00379233f57f799dc18c1eefd35b51db36e3da4770737a3f8fe75eda0cd3c48f23ea705f3234b0929f9e'
        )
      )
      .then((result) => {
        switch (result.status) {
          case 'offline':
            console.log('The peer is offline')
            break
          case 'reject':
            console.log('The peer rejected our connection request')
            break
          case 'fail':
            console.log('The connection failed')
            break
          case 'succeed':
            console.log('connection succeeded')
            result.peerConnection.chat.addEventListener('message', (msg) => {
              console.log('📨 peer: ' + msg.data)
            })
            result.peerConnection.chat.send('Hello there, connection that I initiated!!')
        }
      })
  }
}
