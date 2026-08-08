import { HarmonyError } from './routine'

type MsgFromServerCallbackType = (msg: Buffer | HarmonyError) => void

/**
 * Struct to keep track of a transaction socket and to hold a callback for incoming messages on this socket.
 * Transaction sockets are multiplexed onto the websocket.
 * The transaction socket id is the 16 characters at the start of each message on that socket.
 */
export class HarmonyTransactionSocket {
  id: Buffer
  // connection.ts calls this when a message is received for this transaction socket id
  messageCallback: undefined | MsgFromServerCallbackType

  constructor(id: Buffer) {
    this.id = id
  }

  // add a callback
  onReceiveMessage(callback: MsgFromServerCallbackType): void {
    this.messageCallback = callback
  }
}
