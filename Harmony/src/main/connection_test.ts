// import { HarmonyConnection } from './connection/HarmonyConnection'

// /**
//  * connectionTest(0) creates a websocket connection and listens for peers.
//  * connectionTest(1) creates a websocket connection and attempts to connect to 0.
//  * Both send a message to the other once complete.
//  */
// export async function connectionTest(i: 0 | 1) {
//   if (i == 0) {
//     const connection = new HarmonyConnection(
//       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
//     )

//     // for logging purposes
//     connection.onSendMessage = (msg) => {
//       console.log('📮 WSsend: ' + msg)
//     }
//     connection.onReceiveMessage = (msg) => {
//       console.log('📬 WSrecv: ' + msg)
//     }

//     // accept all incoming connections, ignore pk
//     connection.onIncomingConnectionRequest = (pk) => {
//       console.info('Accepting a connection request from ' + pk)
//       return 'accept'
//     }

//     // accept all friend requests
//     connection.onReceiveFriendRequest = (pk) => {
//       console.info('Accepting a friend request from ' + pk)
//       return 'accept'
//     }

//     connection.onReceiveFriendRejection = (pk) => {
//       console.info('Got a friend rejection from ' + pk)
//     }

//     connection.onIncomingConnectionResult = (result) => {
//       switch (result.status) {
//         case 'fail':
//           console.error(result.msg)
//           break
//         case 'succeed':
//           console.info('connection succeeded')
//           result.peerConnection.chatChannel.addEventListener('message', (msg) => {
//             console.log('📩 PEERrecv: ' + msg.data)
//           })
//           // eslint-disable-next-line
//           const msgForPeer = 'Hello there, incoming connection!'
//           console.log('📨 PEERsend: ' + msgForPeer)
//           result.peerConnection.chatChannel.send(msgForPeer)
//       }
//     }

//     // startup connection
//     try {
//       await connection.reconnect()
//     } catch (e) {
//       console.error((e as Error).message)
//       return
//     }
//   } else if (i == 1) {
//     const connection = new HarmonyConnection(
//       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
//     )

//     connection.onSendMessage = (msg) => {
//       console.log('📮 WSsend: ' + msg)
//     }

//     connection.onReceiveMessage = (msg) => {
//       console.log('📬 WSrecv: ' + msg)
//     }

//     try {
//       await connection.reconnect()
//     } catch (e) {
//       console.error((e as Error).message)
//       return
//     }

//     // send friend request
//     const friendRequestResult = await connection.sendFriendRequest(
//       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
//     )

//     switch (friendRequestResult.status) {
//       case 'fail':
//         console.info('The friend request failed')
//         console.error(friendRequestResult.msg)
//         break
//       case 'offline':
//         console.info('The friend is offline')
//         break
//       case 'succeed':
//         switch (friendRequestResult.type) {
//           case 'accept':
//             console.info('The peer accepted our friend request')
//             break
//           case 'reject':
//             console.info('The peer rejected our friend request')
//             break
//           case 'pending':
//             console.info('Our friend request is pending')
//             break
//         }
//     }

//     // send friend rejection
//     const friendRejectionResult = await connection.sendFriendRejection(
//       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
//     )

//     switch (friendRejectionResult.status) {
//       case 'fail':
//         console.info('The friend rejection failed')
//         console.error(friendRejectionResult.msg)
//         break
//       case 'offline':
//         console.info('The peer for the friend rejection is offline')
//         break
//       case 'succeed':
//         console.info('The friend rejection was delivered')
//     }

//     // establish connection to friend
//     const peerConnectionResult = await connection.initiatePeerConnection(
//       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
//     )

//     switch (peerConnectionResult.status) {
//       case 'offline':
//         console.info('The peer is offline')
//         break
//       case 'reject':
//         console.info('The peer rejected our connection request')
//         break
//       case 'fail':
//         console.info('The connection failed')
//         console.error(peerConnectionResult.msg)
//         break
//       case 'succeed':
//         console.info('The connection succeeded')
//         peerConnectionResult.peerConnection.chatChannel.addEventListener('message', (msg) => {
//           console.log('📩 PEERrecv: ' + msg.data)
//         })
//         // eslint-disable-next-line
//         const msgForPeer = 'Hello there, connection that I initiated!!'
//         console.log('📨 PEERsend: ' + msgForPeer)
//         peerConnectionResult.peerConnection.chatChannel.send(msgForPeer)
//     }
//   }
// }
