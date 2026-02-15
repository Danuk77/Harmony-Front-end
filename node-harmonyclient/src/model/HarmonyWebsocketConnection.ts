import { connection, Message, client as WebSocketClient } from 'websocket'
import { HarmonyRoutine, HarmonyRoutineOptions } from './routine'
import { comeOnline } from '../routines/initiated/comeOnline'
import { masterRoutine } from '../routines/received/masterRoutine'
import { PeerConnectionCreationResult } from './HarmonyPeerConnection'
import { eToStr, IceServer } from '../utils'
import { Validator } from 'jsonschema'
import { KeyPair } from '../utils'
import { MultiplexedTransactionChannel, TransactionHandler } from './TransactionHandler'

const WS_RECONNECT_TIMEOUT = 10000 // ms

export const validator = new Validator()

export type HarmonyWebsocketConnectionOptions = {
  stunServer: IceServer | null
  turnServer: IceServer | null
}
const defaultOptions: HarmonyWebsocketConnectionOptions = {
  stunServer: null,
  turnServer: null
}

export type FriendRequestResponseType = 'accept' | 'reject' | 'pending'

export type WebsocketStatusType =
  | 'disconnected' // attempt to reconnect after a period.
  | 'connecting'
  | 'connected' // not yet logged in
  | 'logged-in'
  | 'login-failed' // websocket still open, but there was a problem with the login.
  | 'closed' // do not attempt to reconnect

/**
 * Wrapper around a websocket that interacts with the server using the Harmony protocol.
 * Callbacks must be added to this object for various actions, e.g. onIncomingConnectionRequest.
 */
export class HarmonyWebsocketConnection {
  public version = '1.1'
  public options: HarmonyWebsocketConnectionOptions

  private _serverUrl: string | null = null
  private wsConnection?: connection
  private _wsStatus: WebsocketStatusType = 'disconnected'
  private reconnectTimeout?: NodeJS.Timeout
  private _keyPair: KeyPair | null = null
  private reconnectCount = 0
  private _enabled: boolean = false

  private transactionHandler: ReturnType<typeof this.createTransactionHandler>
  private transactionHandlerRecvCallback?: (msg: string) => any
  private transactionHandlerClearCallback?: () => any

  // callback functions - may be added to the object.
  public onWsStatusChange?: (status: WebsocketStatusType) => unknown
  public onFailedLogin?: (reason: string) => unknown
  public onFailedConnect?: (reason: string) => unknown
  public onIncomingConnectionRequest?: (
    publicKey: string
  ) => 'accept' | 'reject' | Promise<'accept' | 'reject'>
  public onIncomingConnectionResult?: (peerConnection: PeerConnectionCreationResult) => unknown
  public onSendMessage?: (msg: string) => unknown
  public onReceiveMessage?: (msg: string) => unknown
  public onReceiveFriendRequest?: (
    pk: string
  ) => FriendRequestResponseType | Promise<FriendRequestResponseType>
  public onReceiveFriendRejection?: (pk: string) => unknown

  constructor(options?: HarmonyWebsocketConnectionOptions) {
    // override default options
    this.options = { ...defaultOptions, ...(options ?? {}) }

    this.keyPair = null
    this.transactionHandler = this.createTransactionHandler()
  }

  public set enabled(enabled: boolean) {
    this._enabled = enabled
    this.reconnect()
  }
  public get enabled() {
    return this._enabled
  }

  public set serverUrl(websocketUrl: string | null) {
    this._serverUrl = websocketUrl
    this.reconnect()
  }

  public get serverUrl() {
    return this._serverUrl
  }

  public set keyPair(keyPair: KeyPair | null) {
    this._keyPair = keyPair
    this.reconnect()
  }

  public get keyPair() {
    return this._keyPair
  }

  private set wsStatus(status: WebsocketStatusType) {
    // prevent the status change after 'closed'
    if (this._wsStatus == 'closed') {
      return
    }

    // if disconnected, set a timer to reconnect.
    if (status == 'disconnected') {
      this.reconnectTimeout = setTimeout(this.reconnect, WS_RECONNECT_TIMEOUT)
    } else {
      clearTimeout(this.reconnectTimeout)
    }

    const oldStatus = this._wsStatus
    this._wsStatus = status
    if (status != oldStatus) {
      this.onWsStatusChange?.(status)
    }
  }

  public get wsStatus() {
    return this._wsStatus
  }

  /**
   * Attempt to reconnect to the websocket and run comeOnline
   * @returns
   */
  public reconnect = async (): Promise<void> => {
    // bump and keep track of reconnect attempt.
    // use this num to detect whether this is the newest reconnect attempt
    // and cancel if not.
    const reconnectNum = ++this.reconnectCount

    if (this.wsStatus == 'closed') {
      // ignore
      return
    }

    // close connection if already open
    this.wsConnection?.close()

    // ignore if no websocket url or not enabled
    if (!this.serverUrl || !this.enabled) {
      return
    }

    // attempt to establish a new websocket connection
    this.wsStatus = 'connecting'
    let con: connection
    try {
      con = await this.getConnection(this.serverUrl)
    } catch (e) {
      this.onFailedConnect?.(eToStr(e))
      // check that this is still the legitimate reconnect(), and that there is not a newer one running somewhere else
      if (reconnectNum == this.reconnectCount) {
        this.wsStatus = 'disconnected'
      }
      return
    }

    // check that this is still the legitimate reconnect(), and that there is not a newer one running somewhere else
    if (reconnectNum != this.reconnectCount) {
      con.close()
      return
    }

    // add event listeners
    con.on('close', this.wsClose)
    con.on('error', this.wsError)
    con.on('message', this.wsMessage)

    this.wsConnection = con

    this.wsStatus = 'connected'

    // comeOnline
    if (this.keyPair) {
      try {
        await comeOnline(this, this.keyPair)
        this.wsStatus = 'logged-in'
      } catch (e) {
        // the error could have been due to a connection close.
        // if so, don't change the wsStatus.
        if (this.wsStatus == 'connected') {
          this.wsStatus = 'login-failed'
        }
        this.onFailedLogin?.((e as Error).message)
      }
    }
  }

  public createTransactionHandler() {
    const channel: MultiplexedTransactionChannel = {
      send: async (msg, routineOptions) => {
        if (
          !this.wsConnection ||
          (routineOptions?.loginRequired && this.wsStatus != 'logged-in') ||
          (!routineOptions?.loginRequired && this.wsStatus != 'connected')
        ) {
          throw new Error('Not connected')
        }
        this.onSendMessage?.(msg)
        // doesn't throw an error if the connection is closed.
        this.wsConnection.send(msg)
      },
      onRecv: (callback) => {
        // we will need to call this when we recieve a message from the websocket
        this.transactionHandlerRecvCallback = callback
      },
      onClear: (callback) => {
        // call this the the websocket closes and all transactions need to be cancelled
        this.transactionHandlerClearCallback = callback
      }
    }

    return new TransactionHandler(channel, masterRoutine, this)
  }

  /**
   * Permanently close the websocket connection
   */
  public close() {
    this.wsStatus = 'closed'
    this.wsConnection?.close()
  }

  private getConnection(websocketUrl: string): Promise<connection> {
    const client = new WebSocketClient()

    client.connect(websocketUrl)

    // return a promise so it can be `await`ed
    return new Promise((resolve, reject) => {
      client.on('connect', resolve)
      client.on('connectFailed', (error) => reject(error))
    })
  }

  private wsError = (err: Error): void => {
    console.error('Websocket error: ', err)
  }
  private wsClose = (): void => {
    // send a HarmonyError message to all open transactions.
    // this causes them to error out and (hopefully) prevent memony leaks
    this.transactionHandlerClearCallback?.()
    this.wsStatus = 'disconnected'
  }

  private wsMessage = (message: Message): void => {
    if (message.type == 'utf8') {
      this.onReceiveMessage?.(message.utf8Data)
      this.transactionHandlerRecvCallback?.(message.utf8Data)
    }
  }

  public async launchRoutine<T>(
    routine: HarmonyRoutine<T, typeof this>,
    partialRoutineOptions?: Partial<HarmonyRoutineOptions>
  ) {
    return await this.transactionHandler.launchRoutine(routine, partialRoutineOptions)
  }

  // /**
  //  * Launch a routine provided as an argument.
  //  * @param routine a callback
  //  */
  // public async launchRoutine<T>(
  //   routine: HarmonyRoutine<T>,
  //   partialRoutineOptions?: Partial<HarmonyRoutineOptions>
  // ): Promise<T> {
  //   // add defaults
  //   const routineOptions = partialRoutineOptions
  //     ? {
  //         ...harmonyRoutineDefaultOptions,
  //         ...partialRoutineOptions
  //       }
  //     : { ...harmonyRoutineDefaultOptions }

  //   // generate a new id if not provided as an argument
  //   if (!routineOptions.id) {
  //     routineOptions.id = this.newTransactionSocketID()
  //   }

  //   const transactionSocket = new HarmonyTransactionSocket(routineOptions.id)
  //   this.transactionSockets.set(transactionSocket.id, transactionSocket)

  //   // flag that determines if the user can still send/receive messages on this id
  //   let tsIsClosed = false

  //   // routines initiated by an incoming message have the first message passed as an option when launchRoutine is called.
  //   // if this is the case this flag is true.
  //   // it is set to false once the first message has been sent.
  //   let mustSendFirstMessageThatWasProvidedInTheOptions = !!routineOptions.firstMsg

  //   // incoming messages from the server
  //   // if the websocket is closed then a HarmonyError is pushed to this queue.
  //   const messageQueue = new AsyncBlockingQueue<string | HarmonyError>()
  //   transactionSocket.onReceiveMessage((msg) => {
  //     // if there was an error coming in, then something must be wrong.
  //     // set tsIsClosed to prevent sending any further messages to the server
  //     if (msg instanceof HarmonyError) {
  //       tsIsClosed = true
  //     }
  //     messageQueue.enqueue(msg)
  //   })

  //   // define callback functions recv and send

  //   const send = async (msg: object): Promise<void> => {
  //     if (tsIsClosed) {
  //       throw new HarmonyError('routine sent to closed transaction socket')
  //     }

  //     // client cancels.
  //     if (Object.prototype.hasOwnProperty.call(msg, 'terminate')) {
  //       tsIsClosed = true
  //       // enqueue HarmonyError in case there is any recv() being awaited - causes the recv to raise an error
  //       messageQueue.enqueue(new HarmonyError('Timeout waiting for server response'))
  //     }

  //     if (
  //       !this.wsConnection ||
  //       (routineOptions.loginRequired && this.wsStatus != 'logged-in') ||
  //       (!routineOptions.loginRequired && this.wsStatus != 'connected')
  //     ) {
  //       throw new Error('Not connected')
  //     }

  //     const strMsg = transactionSocket.id + JSON.stringify(msg)
  //     this.onSendMessage?.(strMsg)
  //     // doesn't throw an error if the connection is closed.
  //     this.wsConnection.send(strMsg)
  //   }

  //   /**
  //    * @throws HarmonyError if the server sends a `{terminate:"error"}` property
  //    */
  //   const recv = async <S extends JSONSchema, T = FromSchema<S>>(schema?: S): Promise<T> => {
  //     if (tsIsClosed) {
  //       throw new HarmonyError('recv on closed transaction socket')
  //     }

  //     let msg: string
  //     if (mustSendFirstMessageThatWasProvidedInTheOptions) {
  //       /**@ts-expect-error if the above flag is set, we know that firstMsg is not undefined. */
  //       msg = routineOptions.firstMsg
  //       mustSendFirstMessageThatWasProvidedInTheOptions = false
  //     } else {
  //       // set a timeout waiting for the server response. If no response, `send()` a terminate message
  //       // `send()`ing the terminate message causes a HarmonyError to be pushed to the messageQueue
  //       // ...which is dequeued below, and thrown. This causes the routine to error out - prevent getting stuck.
  //       const timeout = setTimeout(() => {
  //         send({
  //           terminate: 'cancel'
  //         }).catch(() => {})
  //       }, TRANSACTION_SOCKET_TIMEOUT)

  //       // wait for a message/error
  //       const messageOrError = await messageQueue.dequeue()

  //       // cancel timeout when message is received
  //       clearTimeout(timeout)

  //       // if the dequeued message is a HarmonyError, throw it, preventing the recv() call getting stuck.
  //       if (messageOrError instanceof HarmonyError) {
  //         throw messageOrError
  //       }
  //       msg = messageOrError
  //     }

  //     // parse
  //     // let parsed: S extends JSONSchema ? FromSchema<S> : object
  //     let parsed: object
  //     try {
  //       parsed = JSON.parse(msg)
  //     } catch (e) {
  //       throw new HarmonyError(eToStr(e))
  //     }

  //     // check if the server is terminating
  //     if (Object.prototype.hasOwnProperty.call(parsed, 'terminate')) {
  //       tsIsClosed = true

  //       const terminateMsg = parsed as {
  //         terminate: string
  //         error?: string
  //       }

  //       // throw any error received from the server
  //       if (terminateMsg.terminate == 'cancel') {
  //         throw new HarmonyError(terminateMsg.error)
  //       }
  //     } else if (Object.prototype.hasOwnProperty.call(parsed, 'error')) {
  //       // non-terminating errors.
  //       const errorMsg = parsed as {
  //         error: string
  //       }
  //       console.log(errorMsg.error)

  //       // terminate the connection anyway. don't bother with re-sending messages for now.
  //       send({ terminate: 'cancel' })
  //       throw new HarmonyError(errorMsg.error)
  //     }

  //     // compare against schema
  //     if (schema) {
  //       const result = validator.validate(parsed, schema as object)
  //       if (!result.valid) {
  //         throw new HarmonyError(
  //           'Error on incoming message: ' + result.errors.map((err) => err.toString()).join(', ')
  //         )
  //       }
  //     }
  //     // apply typings
  //     return parsed as T
  //   }

  //   try {
  //     return await routine({ recv, send })
  //   } finally {
  //     if (!tsIsClosed) {
  //       // apparently the connection is still open. Attempt to close it.
  //       try {
  //         send({ terminate: 'cancel' })
  //       } finally {
  //         /**have to write a comment here for eslint reasons...*/
  //       }
  //     }
  //     tsIsClosed = true
  //     this.transactionSockets.delete(routineOptions.id)
  //   }
  // }

  // private newTransactionSocketID(): string {
  //   // 16 random characters
  //   const charset = 'abcdefghijklmnopqrstuvwxyz0123456789'
  //   let id: string | undefined = undefined

  //   // randomly generate a key
  //   // In the tiny chance such an id already exists, do it again.
  //   while (!id || this.transactionSockets.has(id)) {
  //     id = new Array(16)
  //       .fill('')
  //       .map(() => charset[Math.floor(Math.random() * charset.length)])
  //       .join('')
  //   }

  //   return id
  // }
}
