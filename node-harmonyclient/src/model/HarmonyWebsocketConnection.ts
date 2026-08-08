import { connection, Message, client as WebSocketClient } from 'websocket'
import { HarmonyRoutine, HarmonyRoutineOptions } from './routine'
import { comeOnline } from '../routines/initiated/comeOnline'
import { masterRoutine } from '../routines/received/masterRoutine'
import { PeerConnectionCreationResult } from './HarmonyPeerConnection'
import { eToStr, IceServer } from '../utils'
import { Validator } from 'jsonschema'
import { KeyPair } from '../utils'
import { TransactionHandler } from './TransactionHandler'

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
  public serverAPIVersion = '2.0'
  public options: HarmonyWebsocketConnectionOptions

  private _serverUrl: string | null = null
  private wsConnection?: connection
  private _wsStatus: WebsocketStatusType = 'disconnected'
  private reconnectTimeout?: NodeJS.Timeout
  private _keyPair: KeyPair | null = null
  private reconnectCount = 0
  private _enabled: boolean = false

  private transactionHandler: ReturnType<typeof this.createTransactionHandler>

  // callback functions - may be added to the object.
  public onWsStatusChange?: (status: WebsocketStatusType) => unknown
  public onFailedLogin?: (reason: string) => unknown
  public onFailedConnect?: (reason: string) => unknown
  public onIncomingConnectionRequest?: (
    publicKey: string
  ) => 'accept' | 'reject' | Promise<'accept' | 'reject'>
  public onIncomingConnectionResult?: (peerConnection: PeerConnectionCreationResult) => unknown
  public onSendMessage?: (msg: Buffer) => unknown
  public onReceiveMessage?: (msg: Buffer) => unknown
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

    this.startHeartbeat(con)

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

  private startHeartbeat(con: connection) {
    // if we haven't received a ping or a ping for 10 seconds then send a ping. If no pong response in 5 seconds then disconnect.
    var closeTimeout: NodeJS.Timeout
    const setCloseTimeout = () => {
      clearTimeout(closeTimeout)
      closeTimeout = setTimeout(() => {
        this.wsConnection?.close()
        this.wsStatus = 'disconnected'
      }, 5_000)
    }
    const checkConnection = () => {
      con.ping('')
      setCloseTimeout()
    }

    var checkTimeout: NodeJS.Timeout
    const resetCheckTimeout = () => {
      clearTimeout(checkTimeout)
      checkTimeout = setTimeout(checkConnection, 10_000 * (0.9 + Math.random() * 0.2))
    }
    resetCheckTimeout()

    con.on('ping', () => {
      resetCheckTimeout()
      clearTimeout(closeTimeout)
    })
    con.on('pong', () => {
      resetCheckTimeout()
      clearTimeout(closeTimeout)
    })
    con.on('close', () => {
      clearTimeout(closeTimeout)
      clearTimeout(checkTimeout)
    })
  }

  public createTransactionHandler() {
    return new TransactionHandler(
      async (msg, routineOptions) => {
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
      masterRoutine,
      this
    )
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
    this.transactionHandler.clear()
    this.wsStatus = 'disconnected'
  }

  private wsMessage = (message: Message): void => {
    let data: Buffer
    switch (message.type) {
      case 'utf8': {
        data = Buffer.from(message.utf8Data)
        break
      }
      case 'binary': {
        data = Buffer.from(message.binaryData)
        break
      }
    }
    this.onReceiveMessage?.(data)
    this.transactionHandler.recv(data)
  }

  public async launchRoutine<T>(
    routine: HarmonyRoutine<T, typeof this>,
    partialRoutineOptions?: Partial<HarmonyRoutineOptions>
  ) {
    return await this.transactionHandler.launchRoutine(routine, partialRoutineOptions)
  }
}
