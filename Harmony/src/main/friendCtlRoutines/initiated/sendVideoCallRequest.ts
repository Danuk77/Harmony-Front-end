import { eToStr } from '../../../common/utils'
import { FriendConnectionHandler } from '../../FriendConnectionHandler'

export function sendVideoCallRequest(fch: FriendConnectionHandler) {
  // video call window *should* be open

  if (fch.videoCallManager.routineManager.currentSignalling) {
    // not sure what the renderer is doing - why is it trying to create a new transaction while one is still in progress?
    // whatever, just cancel the old one
    fch.videoCallManager.routineManager.cancelCurrentRoutine('Re-calling with another routine')
  }

  fch.controlChannelTransactionHandler.launchRoutine((_, { send, recv }) => {
    return new Promise<void>(async (resolve2, reject2) => {
      // todo delete these
      const reject = (...args) => {
        console.log('rejected')
        reject2(...args)
      }

      const resolve = (...args) => {
        console.log('resolved')
        resolve2(...args)
      }
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
