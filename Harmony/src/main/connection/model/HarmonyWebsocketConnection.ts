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
import { PeerConnectionCreationResult } from './HarmonyPeerConnection'

const TRANSACTION_SOCKET_TIMEOUT = 20000 //ms
const WS_RECONNECT_TIMEOUT = 10000 // ms

export type HarmonyWebsocketConnectionOptions = {
  /**
   * Url of the signalling server websocket endpoint.
   */
  websocketUrl: string | null
}
const defaultOptions: HarmonyWebsocketConnectionOptions = {
  websocketUrl: null
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
  public version = '0.0'

  private options: HarmonyWebsocketConnectionOptions
  private wsConnection?: connection
  private _wsStatus: WebsocketStatusType = 'disconnected'
  private transactionSockets: Map<string, HarmonyTransactionSocket>
  private reconnectTimeout?: NodeJS.Timeout
  private _publicKey: string | null = null
  private reconnectCount = 0

  // callback functions - may be added to the object.
  public onWsStatusChange?: (status: WebsocketStatusType) => unknown
  public onFailedLogin?: (reason: string) => unknown
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

  constructor(publicKey: string | null, options?: Partial<HarmonyWebsocketConnectionOptions>) {
    // override default options
    this.options = options
      ? {
          ...defaultOptions,
          ...options
        }
      : { ...defaultOptions }

    this.transactionSockets = new Map()
    this.publicKey = publicKey
  }

  public set websocketUrl(websocketUrl: string | null) {
    this.options.websocketUrl = websocketUrl
    this.reconnect()
  }

  public get websocketUrl() {
    return this.options.websocketUrl
  }

  public set publicKey(publicKey: string | null) {
    this._publicKey = publicKey
    this.reconnect()
  }

  public get publicKey() {
    return this._publicKey
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

    // ignore if no websocket url
    if (!this.options.websocketUrl) {
      return
    }

    // attempt to establish a new websocket connection
    this.wsStatus = 'connecting'
    let con: connection
    try {
      con = await this.getConnection(this.options.websocketUrl)
    } catch {
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
    if (this.publicKey) {
      try {
        await comeOnline(this, this.publicKey)
        this.wsStatus = 'logged-in'
      } catch (e) {
        this.wsStatus = 'login-failed'
        this.onFailedLogin?.((e as Error).message)
      }
    }
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

    client.connect(websocketUrl, [''])

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
    this.wsStatus = 'disconnected'
    for (const { messageCallback } of this.transactionSockets.values()) {
      messageCallback?.(null)
    }
    // clear map
    this.transactionSockets = new Map()
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

      if (
        !this.wsConnection ||
        (routineOptions.loginRequired && this.wsStatus != 'logged-in') ||
        (!routineOptions.loginRequired && this.wsStatus != 'connected')
      ) {
        tsIsClosed = true
        throw new Error('Not connected')
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
