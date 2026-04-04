import { FriendConnectionHandler } from '../../FriendConnectionHandler'

export async function sendMessage(fch: FriendConnectionHandler, msg: string, msgId: number) {
  await fch.controlChannelTransactionHandler.launchRoutine(async (_, { send, recv }) => {
    await send({
      initiate: 'message',
      message: msg,
      number: msgId
    })

    await recv()
  })
}
