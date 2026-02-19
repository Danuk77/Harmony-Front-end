import { eToStr } from '../../../common/utils'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'

export async function sendVideoCallRequest(fch: FriendConnectionHandler) {
  // video call window *should* be open

  await new Promise<void>(async (resolve, reject) => {
    if (fch.videoCallRoutineManager.current) {
      // not sure what the renderer is doing - why is it trying to create a new transaction while one is still in progress?
      // whatever, just cancel the old one
      fch.videoCallRoutineManager.cancelCurrentRoutine()
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

      fch.videoCallRoutineManager.setCurrent({
        state: 'outgoing',
        send,
        recv,
        resolve,
        reject
      })
      fch.videoCallRoutineManager.startWaitLoop()
      fch.videoCallRoutineManager.startRecvLoop()
    })
  })
}
