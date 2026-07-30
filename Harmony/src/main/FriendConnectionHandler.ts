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
import { ICECandidate, VideoCallRoutine } from './friendCtlRoutines/VideoCallRoutine'
import { sendMessage } from './friendCtlRoutines/initiated/sendMessage'
import { assertNever } from '../common/utils'
import { sendVerifyIdentity } from './friendCtlRoutines/initiated/sendVerifyIdentity'
import { eToStr } from './Controller'
import { sendGetCapabilities } from './friendCtlRoutines/initiated/sendGetCapabilities'
import { capabilities, capAlternatives } from './friendCtlRoutines/capabilities'

export type FriendConnectionStatus =
  | 'verified-connected' // connected to the friend and friend's identity verified
  // | 'verified-rtc-disconnected' // verified, & see below "online-rtc-disconnected"
  | 'unverified-connected' // connected to the friend, friend's identity not verified
  // | 'online-rtc-disconnected' // rtc peer connection is still alive, but connection is faulty. Might regain connection or switch to online-disconnected if the rtc connection is lost entirely.
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
  private _capabilities: string[] | null = null

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
  public onReceiveMessage: (msg: string, msgNumber: number | null) => unknown | Promise<unknown>
  public onPeerSdpAnswerForVideoCall: (
    sdp: { type: 'answer'; sdp: string },
    callID: number
  ) => unknown
  public onPeerIceCandidateForVideoCall: (candidate: ICECandidate, callID: number) => unknown

  // used in inner functions
  public onAcceptOrRejectVideoCall?: (status: 'accept' | 'reject') => unknown

  constructor(
    con: HarmonyConnection,
    friendDB: Friend,
    // videoCallStatus: FriendVideoCallStatus,
    callbacks: {
      onConnectionStatusChange: FriendConnectionHandler['onConnectionStatusChange']
      onVideoCallStatusChange: VideoCallManager['onVideoCallStatusChange']
      onReceiveMessage: FriendConnectionHandler['onReceiveMessage']
      onPeerSdpAnswerForVideoCall: FriendConnectionHandler['onPeerSdpAnswerForVideoCall']
      onPeerIceCandidateForVideoCall: FriendConnectionHandler['onPeerIceCandidateForVideoCall']
    }
  ) {
    // set callbacks
    this.onReceiveMessage = callbacks.onReceiveMessage
    this.onConnectionStatusChange = callbacks.onConnectionStatusChange
    this.onPeerSdpAnswerForVideoCall = callbacks.onPeerSdpAnswerForVideoCall
    this.onPeerIceCandidateForVideoCall = callbacks.onPeerIceCandidateForVideoCall

    // this.onCallStatusChange = onCallStatusChange
    this.friend = friendDB
    // this.videoCallStatus = videoCallStatus
    this.con = con

    // messages on the ctl channel
    this.controlChannelTransactionHandler = new TransactionHandler(
      async (msg, _) => {
        console.log('📮 CTLsend: ' + msg)
        this.peerConnection?.ctlChannel.send(msg)
      },
      masterRoutine,
      this
    )
    const videoCallRoutine = new VideoCallRoutine(friendDB.peerPk, this)
    this.videoCallManager = new VideoCallManager(
      friendDB.peerPk,
      callbacks.onVideoCallStatusChange,
      videoCallRoutine,
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
      case 'do-not-connect':
      case 'unverified-connected':
      case 'closed':
      case 'unset':
      case 'verified-connected':
        break
      default:
        assertNever(status)
    }

    // clear capabilities
    switch (status) {
      case 'verified-connected':
      case 'unverified-connected':
        break
      case 'online-disconnected':
      case 'failed':
      case 'offline':
      case 'unknown':
      case 'do-not-connect':
      case 'rejected':
      case 'connecting':
      case 'closed':
      case 'unset':
        this.capabilities = null
        break
      default:
        assertNever(status)
    }
  }

  private get capabilities() {
    return this._capabilities
  }

  private set capabilities(capabilities) {
    this._capabilities = capabilities
    /**@todo fire listener */
  }

  public acceptOrRejectVideoCall = (status: 'accept' | 'reject') => {
    this.onAcceptOrRejectVideoCall?.(status)
  }

  public attemptConnection = () => {
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
    if (
      this.connectionStatus == 'unverified-connected' ||
      this.connectionStatus == 'verified-connected'
    ) {
      if (result.status == 'succeed') {
        // reassign this.peerConnection first before closing so the event listener for the old channel doesn't change the status when it closes.
        const oldPeerConnection = this.peerConnection
        this.peerConnection = result.peerConnection
        oldPeerConnection?.close()
        this.capabilities = null
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
          this.onReceiveMessage?.(msg.toString(), null)
        })
        this.peerConnection.ctlChannel.onMessage.subscribe((msg) => {
          console.log('📬 CTLrecv: ' + msg)
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
            result.peerConnection.removeAllListeners()
          }
        }
        this.peerConnection.chatChannel.stateChanged.subscribe(onChannelStateChanged)
        this.peerConnection.ctlChannel.stateChanged.subscribe(onChannelStateChanged)

        result.peerConnection.rtc.connectionStateChange.subscribe(() => {
          switch (result.peerConnection.rtc.connectionState) {
            case 'closed':
            case 'failed':
            case 'disconnected': {
              // set to online-disconnected - if the peer connection was still in use
              if (this.peerConnection == result.peerConnection) {
                this.connectionStatus = 'online-disconnected'
                this.controlChannelTransactionHandler.clear()
              }
              result.peerConnection.removeAllListeners()
              result.peerConnection.close()
              break
            }
            // {
            //   if (this.peerConnection == result.peerConnection) {
            //     this.connectionStatus = 'online-rtc-disconnected'
            //     console.error(`Temporarily disconnected from ${this.friend.nickname}`)
            //   }
            //   break
            // }
            case 'connected': {
              if (this.peerConnection == result.peerConnection) {
                this.connectionStatus = 'unverified-connected'
              }
              break
            }
            case 'new':
            case 'connecting':
              break
          }
        })

        this.connectionStatus = 'unverified-connected'

        const ctlId = result.peerConnection.ctlChannel.id

        // verify peer's identity (async)
        sendVerifyIdentity(this)
          .then((verified) => {
            // check that the connection has not changed
            if (this.peerConnection?.ctlChannel.id != ctlId) {
              return
            }
            if (verified) {
              if (this.connectionStatus == 'unverified-connected') {
                this.connectionStatus = 'verified-connected'
              }
            } else {
              console.error(`Friend with pk ${this.friend.peerPk} could not be verified.`)
            }
          })
          .catch((e) =>
            console.error(
              `Friend with pk ${this.friend.peerPk} could not be verified. ${eToStr(e)}`
            )
          )

        // get friend's capabilities (async)
        sendGetCapabilities(this)
          .then((capabilities) => {
            // check that the connection has not changed
            if (this.peerConnection?.ctlChannel.id != ctlId) {
              return
            }
            this.capabilities = capabilities
          })
          .catch((e) =>
            console.error(
              `Could not get capabilities of friend with pk ${this.friend.peerPk}. ${eToStr(e)}`
            )
          )
        break
      default:
        this.connectionStatus = 'failed'
    }
  }

  // choose the newest capability alt that is supported by both us and the client
  private getSupportedCapabilityAlt<E extends keyof typeof capAlternatives>(
    cap: E
  ): (typeof capAlternatives)[E][number] | null {
    // choose a routine that the peer supports
    if (this.capabilities) {
      for (const alt of capAlternatives[cap]) {
        if (this.capabilities.includes(alt)) {
          return alt
        }
      }
    }
    return null
  }

  /**
   * Attempt to send a message. Might throw an error
   * @param msg
   */
  public async sendMessage(msg: string, msgNumber: number) {
    if (!this.peerConnection?.ctlChannel) {
      throw new Error('Chat control channel not established')
    }

    const alt = this.getSupportedCapabilityAlt('message') ?? 'message'
    switch (alt) {
      case 'message':
        await sendMessage(this, msg, msgNumber)
        break
      default:
        assertNever(alt)
    }
  }

  public sendVideoCallRequest(callID: number) {
    const alt = this.getSupportedCapabilityAlt('videoCallRequest') ?? 'videoCallRequest'
    switch (alt) {
      case 'videoCallRequest':
        return sendVideoCallRequest(this, callID)
      default:
        assertNever(alt)
    }
  }

  // close the connection and prevent reconnections.
  public close() {
    this.connectionStatus = 'closed'
    this.peerConnection?.close()
  }
}
