import { HarmonyWebsocketConnection } from './connection/model/HarmonyWebsocketConnection'
import { initiatePeerConnection } from './connection/routines/initiated/initiatePeerConnection'
import { sendFriendRejection } from './connection/routines/initiated/sendFriendRejection'
import { sendFriendRequest } from './connection/routines/initiated/sendFriendRequest'

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
    connection.startup().catch((e) => console.error((e as Error).message))

    // for logging purposes. The messages are forwarded internally.
    connection.onSendMessage = (msg) => {
      console.log('📮 WSsend: ' + msg)
    }
    connection.onReceiveMessage = (msg) => {
      console.log('📬 WSrecv: ' + msg)
    }

    // accept all incoming connections, ignore pk
    connection.onIncomingConnectionRequest = (pk) => {
      console.info('Accepting a connection request from ' + pk)
      return 'accept'
    }

    // accept all friend requests
    connection.onReceiveFriendRequest = (pk) => {
      console.info('Accepting a friend request from ' + pk)
      return 'accept'
    }

    connection.onReceiveFriendRejection = (pk) => {
      console.info('Got a friend rejection from ' + pk)
    }

    connection.onIncomingConnectionResult = (result) => {
      switch (result.status) {
        case 'fail':
          console.error(result.msg)
          break
        case 'succeed':
          console.info('connection succeeded')
          result.peerConnection.chat.addEventListener('message', (msg) => {
            console.log('📩 PEERrecv: ' + msg.data)
          })
          // eslint-disable-next-line
          const msgForPeer = 'Hello there, incoming connection!'
          console.log('📨 PEERsend: ' + msgForPeer)
          result.peerConnection.chat.send(msgForPeer)
      }
    }
  } else if (i == 1) {
    const connection = new HarmonyWebsocketConnection(
      'cffd10babed1182e7d8e6cff845767eeae4508aa13cd00379233f57f799dc18c1eefd35b51db36e3da4770737a3f8fe75eda0cd3c48f23ea705f3234b0929f9f'
    )

    connection.onSendMessage = (msg) => {
      console.log('📮 WSsend: ' + msg)
    }

    connection.onReceiveMessage = (msg) => {
      console.log('📬 WSrecv: ' + msg)
    }

    connection
      .startup()
      .catch((e) => console.error((e as Error).message))
      .then(() =>
        sendFriendRequest(
          connection,
          'cffd10babed1182e7d8e6cff845767eeae4508aa13cd00379233f57f799dc18c1eefd35b51db36e3da4770737a3f8fe75eda0cd3c48f23ea705f3234b0929f9e'
        )
      )
      .then((result) => {
        switch (result.status) {
          case 'fail':
            console.info('The friend request failed')
            console.error(result.msg)
            break
          case 'offline':
            console.info('The friend is offline')
            break
          case 'succeed':
            switch (result.type) {
              case 'accept':
                console.info('The peer accepted out friend request')
                break
              case 'reject':
                console.info('The peer rejected out friend request')
                break
              case 'pending':
                console.info('Our friend request is pending')
                break
            }
        }
      })
      .then(() =>
        sendFriendRejection(
          connection,
          'cffd10babed1182e7d8e6cff845767eeae4508aa13cd00379233f57f799dc18c1eefd35b51db36e3da4770737a3f8fe75eda0cd3c48f23ea705f3234b0929f9e'
        )
      )
      .then((result) => {
        switch (result.status) {
          case 'fail':
            console.info('The friend rejection failed')
            console.error(result.msg)
            break
          case 'offline':
            console.info('The peer for the friend rejection is offline')
            break
          case 'succeed':
            console.info('The friend rejection was delivered')
        }
      })
      .then(() =>
        initiatePeerConnection(
          connection,
          'cffd10babed1182e7d8e6cff845767eeae4508aa13cd00379233f57f799dc18c1eefd35b51db36e3da4770737a3f8fe75eda0cd3c48f23ea705f3234b0929f9e'
        )
      )
      .then((result) => {
        switch (result.status) {
          case 'offline':
            console.info('The peer is offline')
            break
          case 'reject':
            console.info('The peer rejected our connection request')
            break
          case 'fail':
            console.info('The connection failed')
            console.error(result.msg)
            break
          case 'succeed':
            console.info('The connection succeeded')
            result.peerConnection.chat.addEventListener('message', (msg) => {
              console.log('📩 PEERrecv: ' + msg.data)
            })
            // eslint-disable-next-line
            const msgForPeer = 'Hello there, connection that I initiated!!'
            console.log('📨 PEERsend: ' + msgForPeer)
            result.peerConnection.chat.send(msgForPeer)
        }
      })
  }
}
