import { sendVideoCallRequest } from './friendCtlRoutines/initiated/sendVideoCallRequest'
import { masterRoutine } from './friendCtlRoutines/received/masterRoutine'
import { VideoCallManager } from './VideoCallManager'
import { Friend } from './LocalDatabase'
import {
  HarmonyConnection,
  HarmonyPeerConnection,
  PeerConnectionCreationResult,
  TransactionHandler
} from 'node-harmonyclient'
import { VideoCallRoutine } from './friendCtlRoutines/VideoCallRoutine'

export type FriendConnectionStatus =
  | 'online-connected' // connected to the friend
  | 'online-disconnected' // peer connection to the friend was lost
  | 'failed' // conenction request failed before it was determined whether the user was online or not.
  | 'offline' // no peer connection, and friend is not connected to the signalling server.
  | 'unknown' // not yet attemted to connect to the friend. Will do so immediately.
  | 'do-not-connect' // The "friend" actually hasn't accepted our friend request yet, or we haven't accepted theirs.
  | 'rejected' // The friend rejected a previous attempt to connect to us. Maybe there is another connection attempt in progress.
  | 'connecting' // A connection attempt with the friend is ongoing.
  | 'closed' // Our side has terminated the connection, and it cannot be reopened. Called when we wish to delete the friend or edit their public key.
  | 'unset'

const offlineReconnectPeriod = 300_000 // ms (5 minutes)
const disconnectedReconnectPeriod = 10_000 //ms
const failedReconnectPeriod = 300_000 // ms
const rejectedReconnectPeriod = 10_000 // ms

export class FriendConnectionHandler {
  // set from redux store
  // @ts-ignore this.friend is set in the constructor - that sets this in turn.
  private _friend: Friend

  // set to redux store
  private _connectionStatus: FriendConnectionStatus = 'unset'

  // _paused == true: Stop trying to connect to the peer. E.g., may be used when the websocket connection is broken.
  private _paused: boolean = true
  private shouldReconnectWhenUnpaused = false

  private reconnectTimeout?: NodeJS.Timeout

  public con: HarmonyConnection
  private peerConnection?: HarmonyPeerConnection

  public controlChannelTransactionHandler: TransactionHandler<void, this>
  // public videoCallRoutine: VideoCallRoutine
  public videoCallManager: VideoCallManager

  // callbacks
  public onConnectionStatusChange: (status: typeof this._connectionStatus) => unknown
  public onReceiveMessage: (msg: string) => unknown

  // used in inner functions
  public onAcceptOrRejectVideoCall?: (status: 'accept' | 'reject') => unknown

  constructor(
    con: HarmonyConnection,
    friendDB: Friend,
    // videoCallStatus: FriendVideoCallStatus,
    onConnectionStatusChange: typeof this.onConnectionStatusChange,
    onVideoCallStatusChange: VideoCallManager['onVideoCallStatusChange'],
    onReceiveMessage: typeof this.onReceiveMessage
  ) {
    this.onReceiveMessage = onReceiveMessage
    this.onConnectionStatusChange = onConnectionStatusChange
    // this.onCallStatusChange = onCallStatusChange
    this.friend = friendDB
    // this.videoCallStatus = videoCallStatus
    this.con = con

    // messages on the ctl channel
    this.controlChannelTransactionHandler = new TransactionHandler(
      async (msg, _) => {
        this.peerConnection?.ctlChannel.send(msg)
      },
      masterRoutine,
      this
    )
    this.videoCallManager = new VideoCallManager(
      friendDB.peerPk,
      onVideoCallStatusChange,
      new VideoCallRoutine(friendDB.peerPk),
      this
    )
  }

  public get friend() {
    return this._friend
  }
  /**
   * Set this._friend and update the connection status too.
   */
  public set friend(friend: Friend) {
    // pk must NOT change.
    if (!!this.friend?.peerPk && friend.peerPk != this.friend.peerPk) {
      throw new Error('The friend public key must NOT change.')
    }

    this._friend = friend
    if (friend.status == 'accept') {
      if (this.connectionStatus == 'unset' || this.connectionStatus == 'do-not-connect') {
        // start trying to connect.
        this.connectionStatus = 'unknown'
      }
    } else {
      this.connectionStatus = 'do-not-connect'
    }
  }

  /**
   * Stop trying to connect to the peer. E.g., may be used when the websocket connection is broken.
   */
  public set paused(value: boolean) {
    if (this._paused == value) {
      return // value has not changed
    }

    this._paused = value

    if (value == true) {
      // check if we we're scheduled to connect to the peer
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout)
        this.reconnectTimeout = undefined
        this.shouldReconnectWhenUnpaused = true
      }
    } else {
      if (this.shouldReconnectWhenUnpaused) {
        this.attemptConnection()
      }
      this.shouldReconnectWhenUnpaused = false
    }
  }
  public get paused() {
    return this._paused
  }

  /**
   * The connection status. Many possibilities: look at the definition of FriendConnectionStatus.
   * No external write access to this property!
   */
  private get connectionStatus(): FriendConnectionStatus {
    return this._connectionStatus
  }
  private set connectionStatus(status: FriendConnectionStatus) {
    if (this._connectionStatus == 'closed') {
      return // ignore
      // throw new Error("Can't change closed connection status")
    }

    const hasChanged = status != this._connectionStatus
    this._connectionStatus = status
    if (hasChanged) {
      this.onConnectionStatusChange?.(status)
    }

    // schedule another reconnect attempt, depending on the status.
    clearTimeout(this.reconnectTimeout)
    this.reconnectTimeout = undefined
    switch (status) {
      case 'online-disconnected':
        this.reconnectTimeout = setTimeout(this.attemptConnection, disconnectedReconnectPeriod)
        break
      case 'failed':
        this.reconnectTimeout = setTimeout(this.attemptConnection, failedReconnectPeriod)
        break
      case 'rejected':
        this.reconnectTimeout = setTimeout(this.attemptConnection, rejectedReconnectPeriod)
        break
      case 'offline':
        this.reconnectTimeout = setTimeout(this.attemptConnection, offlineReconnectPeriod)
        break
      case 'unknown':
        this.attemptConnection() // attempt to connect immediately
        break
      case 'connecting':
        break
      case 'do-not-connect':
        break
      case 'online-connected':
        break
      case 'closed':
        break
    }
  }

  public acceptOrRejectVideoCall = (status: 'accept' | 'reject') => {
    this.onAcceptOrRejectVideoCall?.(status)
  }

  private attemptConnection = () => {
    if (this.paused) {
      this.shouldReconnectWhenUnpaused = true
      return
    }
    this.reconnectTimeout = undefined
    this.connectionStatus = 'connecting'
    this.con.initiatePeerConnection(this.friend.peerPk).then((result) => {
      this.receiveConnection(result)
    })
  }

  /**
   * Process a PeerConnectionCreationResult.
   * @param result
   * @returns
   */
  public receiveConnection = (result: PeerConnectionCreationResult) => {
    // reject connections if closed.
    if (this.connectionStatus == 'closed') {
      // close it immediately.
      if (result.status == 'succeed') {
        result.peerConnection.close()
      }
      return
    }

    // if we already have a connection and we are receiving a new connection, replace and close the old one.
    if (this.connectionStatus == 'online-connected') {
      if (result.status == 'succeed') {
        // reassign this.channel first so the event listener for the old channel doesn't change the status when it closes.
        const oldPeerConnection = this.peerConnection
        this.peerConnection = result.peerConnection
        oldPeerConnection?.close()
      } else {
        // ignore the new failed connection. As far as we're concerned, we already have a working connection.
        return
      }
    }

    switch (result.status) {
      case 'offline':
        this.connectionStatus = 'offline'
        break
      case 'reject':
        this.connectionStatus = 'rejected'
        // this DOES NOT mean that we should unfriend them - perhaps another friend request is in progress.
        break
      case 'fail':
        this.connectionStatus = 'failed'
        break
      case 'succeed':
        this.peerConnection = result.peerConnection

        // add event listeners
        this.peerConnection.chatChannel.onMessage.subscribe((msg) => {
          this.onReceiveMessage?.(msg.toString())
        })
        this.peerConnection.ctlChannel.onMessage.subscribe((msg) => {
          this.controlChannelTransactionHandler.recv(msg.toString())
        })

        const onChannelStateChanged: Parameters<
          typeof this.peerConnection.chatChannel.stateChanged.subscribe
        >[0] = (state) => {
          if (state == 'closing' || state == 'closed') {
            // check chat channel has not changed
            if (this.peerConnection == result.peerConnection) {
              // in future we could get an explicit disconnect message from the user.
              this.connectionStatus = 'online-disconnected'
              this.controlChannelTransactionHandler.clear()
            }
            // remove listeners
            result.peerConnection.chatChannel.stateChanged.allUnsubscribe()
            result.peerConnection.ctlChannel.stateChanged.allUnsubscribe()
            result.peerConnection.rtc.connectionStateChange.allUnsubscribe()
          }
        }
        this.peerConnection.chatChannel.stateChanged.subscribe(onChannelStateChanged)
        this.peerConnection.ctlChannel.stateChanged.subscribe(onChannelStateChanged)

        result.peerConnection.rtc.connectionStateChange.subscribe(() => {
          if (
            ['closed', 'disconnected', 'failed'].includes(result.peerConnection.rtc.connectionState)
          ) {
            // set to online-disconnected - if the peer connection was still in use
            if (this.peerConnection == result.peerConnection) {
              this.connectionStatus = 'online-disconnected'
              this.controlChannelTransactionHandler.clear()
            }
            // remove these listeners
            result.peerConnection.chatChannel.stateChanged.allUnsubscribe()
            result.peerConnection.ctlChannel.stateChanged.allUnsubscribe()
            result.peerConnection.rtc.connectionStateChange.allUnsubscribe()
          }
        })

        this.connectionStatus = 'online-connected'
        break
      default:
        this.connectionStatus = 'failed'
    }
  }

  /**
   * Attempt to send a message. Might throw an error.
   * @param msg
   */
  public sendMessage(msg: string) {
    if (!this.peerConnection) {
      throw new Error('Chat channel not established')
    }

    this.peerConnection.chatChannel.send(msg) // might throw an error
  }

  public sendVideoCallRequest() {
    return sendVideoCallRequest(this)
  }

  // close the connection and prevent reconnections.
  public close() {
    this.connectionStatus = 'closed'
    this.peerConnection?.close()
  }
}
