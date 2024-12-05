type MsgFromServerCallbackType = (msg: string | null) => void

/**
 * Struct to keep track of a transaction socket and to hold a callback for incoming messages on this socket.
 */
export class HarmonyTransactionSocket {
  id: string
  // connection.ts calls this when a message is received for this transaction socket id
  messageCallback: undefined | MsgFromServerCallbackType

  constructor(id: string) {
    this.id = id
  }

  // add a callback
  onReceiveMessage(callback: MsgFromServerCallbackType): void {
    this.messageCallback = callback
  }
}
