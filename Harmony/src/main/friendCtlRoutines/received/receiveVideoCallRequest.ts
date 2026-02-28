import { /*HarmonyError,*/ HarmonyRoutineParams } from 'node-harmonyclient'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'
// import { validator } from './masterRoutine'
// import { FromSchema } from 'json-schema-to-ts'
// import { mainToRendererComManager } from '../../MainToRendererComManager'
// import { eToStr } from '../../Controller'

// const initiateSchema = {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   type: 'object',
//   properties: {
//     initiate: {
//       const: 'videoCallRequest'
//     }
//   },
//   required: ['initiate'],
//   additionalProperties: false
// } as const

export async function receiveVideoCallRequest(
  fch: FriendConnectionHandler,
  _: object,
  { send, recv }: HarmonyRoutineParams
) {
  await new Promise<void>((resolve, reject) => {
    fch.videoCallManager.recieveVideoCallRequest({ send, recv }, resolve, reject)

    // // check current state of the vcr manager - there may be another routine trying to establish a video call connection
    // if (fch.videoCallRoutine.currentSignalling) {
    //   switch (fch.videoCallRoutine.currentSignalling.state) {
    //     case 'expectSDPAnswer':
    //     case 'ICE':
    //     case 'outgoing': {
    //       // we are already trying to call them, or have already accepted their call
    //       // peer seems to be calling again on another transaction
    //       // perhaps the old transaction failed on their end and they want to start a new one.
    //       // cancel the transaction on our end and recognize the new one instead
    //       fch.videoCallRoutine.cancelCurrentRoutine()

    //       try {
    //         const typeAndSdp = await mainToRendererComManager.genSdpOfferForVideoCall(
    //           fch.friend.peerPk
    //         )
    //         await send({
    //           type: 'acceptAndOffer',
    //           payload: typeAndSdp
    //         })
    //       } catch (e) {
    //         reject(eToStr(e))
    //         return
    //       }

    //       fch.videoCallRoutine.setCurrentSignalling({
    //         state: 'expectSDPAnswer',
    //         send,
    //         recv,
    //         resolve,
    //         reject
    //       })
    //     }
    //     case 'incoming': {
    //       // the peer has a transaction where they are calling us, but they seem to have started a new one.
    //       // remove the old one and use the new one instead.
    //       // still need to wait for our user to pick up/reject the call.
    //       fch.videoCallRoutine.cancelCurrentRoutine()
    //       fch.videoCallRoutine.setCurrentSignalling({
    //         state: 'incoming',
    //         send,
    //         recv,
    //         resolve,
    //         reject
    //       })
    //       fch.videoCallRoutine.startWaitLoop()
    //     }
    //   }
    // } /*no current routine*/ else {
    //   fch.videoCallRoutine.setCurrentSignalling({
    //     state: 'incoming',
    //     send,
    //     recv,
    //     resolve,
    //     reject
    //   })
    //   fch.videoCallRoutine.startWaitLoop()
    // }
    // fch.videoCallRoutine.startRecvLoop()
  })
}
