import { connection, Message, client as WebSocketClient } from 'websocket'
import { HarmonyTransactionSocket as HarmonyTransactionSocket } from './HarmonyTransactionSocket'
import {
  HarmonyError,
  HarmonyRoutine,
  harmonyRoutineDefaultOptions,
  HarmonyRoutineOptions
} from './routine'
import { AsyncBlockingQueue } from './AsyncBlockingQueue'
import { comeOnline } from '../routines/initiated/comeOnline'
import { masterRoutine } from '../routines/received/masterRoutine'
import { backendURL } from '../config'
import { PeerConnectionCreationResult } from './HarmonyPeerConnection'

const TRANSACTION_SOCKET_TIMEOUT = 3000 //ms

type HarmonyWebsocketConnectionOptions = {
  /**
   * Url of the signalling server websocket endpoint.
   */
  websocketUrl: string
}
const defaultOptions: HarmonyWebsocketConnectionOptions = {
  websocketUrl: backendURL
}

export type FriendRequestResponseType = 'accept' | 'reject' | 'pending'

/**
 * Wrapper around a websocket that interacts with the server using the Harmony protocol.
 * Callbacks must be added to this object for various actions, e.g. onIncomingConnectionRequest.
 */
export class HarmonyWebsocketConnection {
  public version = '0.0'

  private options: HarmonyWebsocketConnectionOptions
  private wsConnection?: connection
  private transactionSockets: Map<string, HarmonyTransactionSocket>
  public publicKey: string
  public isClosed = false

  // callback functions - may be added to the object.

  public onIncomingConnectionRequest?: (
    publicKey: string
  ) => 'accept' | 'reject' | Promise<'accept' | 'reject'>
  public onIncomingConnectionResult?: <T = void>(
    peerConnection: PeerConnectionCreationResult
  ) => T | void
  public onWebsocketClose?: <T = void>() => T | void
  public onSendMessage?: <T = void>(msg: string) => T | void
  public onReceiveMessage?: <T = void>(msg: string) => T | void
  public onReceiveFriendRequest?: (
    pk: string
  ) => FriendRequestResponseType | Promise<FriendRequestResponseType>
  public onReceiveFriendRejection?: <T = void>(pk: string) => T | void

  constructor(publicKey: string, options?: Partial<HarmonyWebsocketConnectionOptions>) {
    // override default options
    this.options = options
      ? {
          ...defaultOptions,
          ...options
        }
      : { ...defaultOptions }

    this.publicKey = publicKey
    this.transactionSockets = new Map()
  }

  public async startup(): Promise<void> {
    const con = await this.getConnection()

    // add event listeners
    con.on('close', this.wsClose)
    con.on('error', this.wsError)
    con.on('message', this.wsMessage)

    this.wsConnection = con

    await comeOnline(this, this.publicKey)
  }

  private getConnection(): Promise<connection> {
    const client = new WebSocketClient()

    client.connect(this.options.websocketUrl)

    // return a promise so it can be `await`ed
    return new Promise((resolve, reject) => {
      client.on('connect', resolve)
      client.on('connectFailed', () => reject(new Error('Connection failed')))
    })
  }

  private wsError = (err: Error): void => {
    console.error('Websocket error: ', err)
  }
  private wsClose = (): void => {
    // send a null message to all open transactions.
    // this causes them to error out and (hopefully) prevent memony leaks
    for (const { messageCallback } of this.transactionSockets.values()) {
      messageCallback?.(null)
    }
    this.isClosed = true
    this.onWebsocketClose?.()
    console.log('Websocket closed')
  }
  private wsMessage = (message: Message): void => {
    if (message.type == 'utf8') {
      this.onReceiveMessage?.(message.utf8Data)
      if (message.utf8Data.length >= 16) {
        const id = message.utf8Data.slice(0, 16)
        const transactionSocket = this.transactionSockets.get(id)

        if (transactionSocket) {
          transactionSocket.messageCallback?.(message.utf8Data.slice(16))
        } else {
          // launch routine, and make the first message returned by recv() the one above.
          this.launchRoutine(({ send, recv }) => masterRoutine(this, { send, recv }), {
            id: id,
            firstMsg: message.utf8Data.slice(16)
          })
        }
      }
    }
  }

  /**
   * Launch a routine provided as an argument.
   * @param routine a callback
   */
  public async launchRoutine<T>(
    routine: HarmonyRoutine<T>,
    partialRoutineOptions?: Partial<HarmonyRoutineOptions>
  ): Promise<T> {
    // add defaults
    const routineOptions = partialRoutineOptions
      ? {
          ...harmonyRoutineDefaultOptions,
          ...partialRoutineOptions
        }
      : { ...harmonyRoutineDefaultOptions }

    // generate a new id if not provided as an argument
    if (!routineOptions.id) {
      routineOptions.id = this.newTransactionSocketID()
    }

    const transactionSocket = new HarmonyTransactionSocket(routineOptions.id)
    this.transactionSockets.set(transactionSocket.id, transactionSocket)

    // flag that determines if the user can still send/receive messages on this id
    let tsIsClosed = false

    // routines initiated by an incoming message have the first message passed as an option when launchRoutine is called.
    // if this is the case this flag is true.
    // it is set to false once the first message has been sent.
    let mustSendFirstMessageThatWasProvidedInTheOptions = !!routineOptions.firstMsg

    // incoming messages from the server
    // if the websocket is closed then a null is pushed to this queue.
    const messageQueue = new AsyncBlockingQueue<string | null>()
    transactionSocket.onReceiveMessage((msg) => {
      messageQueue.enqueue(msg)
    })

    // define callback functions recv and send

    const send = async (msg: object): Promise<void> => {
      if (tsIsClosed) {
        throw new HarmonyError('routine sent to closed transaction socket')
      }

      if (Object.prototype.hasOwnProperty.call(msg, 'terminate')) {
        tsIsClosed = true
      }

      if (!this.wsConnection) {
        throw new Error('Not connected')
      }

      if (this.isClosed) {
        tsIsClosed = true
        throw new HarmonyError('Websocket closed')
      }

      const strMsg = transactionSocket.id + JSON.stringify(msg)
      this.onSendMessage?.(strMsg)
      // doesn't throw an error if the connection is closed.
      this.wsConnection.send(strMsg)
    }

    /**
     * @throws HarmonyError if the server sends a `{terminate:"error"}` property
     */
    const recv = async (): Promise<object> => {
      if (tsIsClosed) {
        throw new HarmonyError('recv on closed transaction socket')
      }

      let msg: string
      if (mustSendFirstMessageThatWasProvidedInTheOptions) {
        /**@ts-ignore if the above flag is set, we know that firstMsg is not undefined. */
        msg = routineOptions.firstMsg
        mustSendFirstMessageThatWasProvidedInTheOptions = false
      } else {
        // send a null msg in case of a timeout
        // causes an error below:
        const timeout = setTimeout(() => {
          send({
            terminate: 'cancel'
          }).catch(() => {})
        }, TRANSACTION_SOCKET_TIMEOUT)

        // wait for a message/null
        const maybeMessage = await messageQueue.dequeue()

        // cancel timeout when message is received
        clearTimeout(timeout)

        if (!maybeMessage) {
          throw new HarmonyError('Peer timeout or websocket closed')
        }
        msg = maybeMessage
      }
      const parsed = JSON.parse(msg)

      // check if the server is terminating
      if (Object.prototype.hasOwnProperty.call(parsed, 'terminate')) {
        tsIsClosed = true

        const terminateMsg = parsed as {
          terminate: string
          error?: string
        }

        // throw any error received from the server
        if (terminateMsg.terminate == 'cancel') {
          throw new HarmonyError(terminateMsg.error)
        }
      } else if (Object.prototype.hasOwnProperty.call(parsed, 'error')) {
        // non-terminating errors.
        const errorMsg = parsed as {
          error: string
        }
        console.log(errorMsg.error)

        // terminate the connection anyway. don't bother with re-sending messages for now.
        /**@todo maybe change - sort out this tsIsClosed thing, it's a mess */
        tsIsClosed = true

        await send({
          terminate: 'cancel'
        })
        throw new HarmonyError(errorMsg.error)
      }

      return parsed
    }

    try {
      return await routine({ recv, send })
    } finally {
      tsIsClosed = true
      this.transactionSockets.delete(routineOptions.id)
    }
  }

  private newTransactionSocketID(): string {
    // 16 random characters
    const charset = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let id: string | undefined = undefined

    // randomly generate a key
    // In the tiny chance such an id already exists, do it again.
    while (!id || this.transactionSockets.has(id)) {
      id = new Array(16)
        .fill('')
        .map(() => charset[Math.floor(Math.random() * charset.length)])
        .join('')
    }

    return id
  }
}
