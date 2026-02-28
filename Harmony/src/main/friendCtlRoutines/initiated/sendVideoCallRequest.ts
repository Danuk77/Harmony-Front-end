import { eToStr } from '../../../common/utils'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'

export async function sendVideoCallRequest(fch: FriendConnectionHandler) {
  // video call window *should* be open

  await new Promise<void>(async (resolve, reject) => {
    if (fch.videoCallManager.routineManager.currentSignalling) {
      // not sure what the renderer is doing - why is it trying to create a new transaction while one is still in progress?
      // whatever, just cancel the old one
      fch.videoCallManager.routineManager.cancelCurrentRoutine()
    }

    fch.controlChannelTransactionHandler.launchRoutine(async (_, { send, recv }) => {
      // send initiate
      try {
        await send({
          initiate: 'videoCallRequest'
        })
      } catch (e) {
        reject(eToStr(e))
        return
      }

      fch.videoCallManager.routineManager.setCurrentSignalling({
        state: 'outgoing',
        send,
        recv,
        resolve,
        reject
      })
      fch.videoCallManager.routineManager.startWaitLoop()
      fch.videoCallManager.routineManager.startRecvLoop()
    })
  })
}
