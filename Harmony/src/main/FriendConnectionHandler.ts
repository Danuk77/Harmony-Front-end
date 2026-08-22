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
import { eToStr } from './Controller'
import { sendGetCapabilities } from './friendCtlRoutines/initiated/sendGetCapabilities'
import { capAlternatives } from './friendCtlRoutines/capabilities'
import { createCipheriv, createDecipheriv, createECDH, ECDH, hkdf, randomBytes } from 'crypto'
import { sendGetECDHPublicKey } from './friendCtlRoutines/initiated/sendGetECDHPublicKey'
import { DEBUG } from '.'
import { getPeerLogger, logger } from './logging'
import winston from 'winston'
import { FriendRoster } from './FriendRoster'

const ENCRYPTED_MESSAGE_BYTE = 0b1000_0001

export type FriendConnectionStatus =
  | 'encrypted-connected' // connected to the friend and a shared secret has been established
  | 'unencrypted-connected' // connected to the friend, a shared secret has NOT been established
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

export type CtlChannelTransactionHandlerState = {
  fch: FriendConnectionHandler
  ctlChannelId: HarmonyPeerConnection['ctlChannel']['id'] | undefined
}

export class FriendConnectionHandler {
  // set from redux store
  // @ts-ignore this.friend is set in the constructor - that sets this in turn.
  private _friend: Friend

  private _peerState: {
    connectionStatus: FriendConnectionStatus
    capabilities: string[] | null
    encryptionAttempts: number
  } = {
    // set to redux store
    connectionStatus: 'unset',

    // not set to redux store
    capabilities: null,
    encryptionAttempts: 0
  }

  public encryptionParams: {
    ecdh: ECDH | null
    peerECDHPublicKey: Buffer | null
    AESKey: Buffer | null
    peerHasReceivedPublicKey: boolean
  } | null = null

  // // set to redux store
  // private _connectionStatus: FriendConnectionStatus = 'unset'
  // private _capabilities: string[] | null = null

  // _paused == true: Stop trying to connect to the peer. E.g., may be used when the websocket connection is broken.
  private _paused: boolean = true
  private shouldReconnectWhenUnpaused = false

  private reconnectTimeout?: NodeJS.Timeout

  public con: HarmonyConnection
  private peerConnection?: HarmonyPeerConnection

  public controlChannelTransactionHandler: TransactionHandler<
    void,
    CtlChannelTransactionHandlerState
  >
  // public videoCallRoutine: VideoCallRoutine
  public videoCallManager: VideoCallManager

  // callbacks
  public onConnectionStatusChange: (status: typeof this._peerState.connectionStatus) => unknown
  public onReceiveMessage: (
    msg: string,
    msgNumber: number | null
  ) => ReturnType<NonNullable<FriendRoster['onReceiveMessage']>>
  public onPeerSdpAnswerForVideoCall: (
    sdp: { type: 'answer'; sdp: string },
    callID: number
  ) => unknown
  public onPeerIceCandidateForVideoCall: (candidate: ICECandidate, callID: number) => unknown

  // used in inner functions
  public onAcceptOrRejectVideoCall?: (status: 'accept' | 'reject') => unknown

  public logger: winston.Logger

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

    this.friend = friendDB
    this.con = con
    this.logger = getPeerLogger({ pk: friendDB.peerPk })

    // messages on the ctl channel
    this.controlChannelTransactionHandler = new TransactionHandler(
      async (msg, _) => {
        if (this.connectionStatus == 'encrypted-connected') {
          // encrypt message
          let encrypted: Buffer
          try {
            encrypted = this.encryptMessage(msg)
          } catch (e) {
            this.encryptionError(eToStr(e))
            throw e
          }
          if (DEBUG) {
            this.logger.verbose('📮🔓 CTLsend: ' + msg)
          }
          this.peerConnection?.ctlChannel.send(encrypted)
        } else {
          if (DEBUG) {
            this.logger.verbose('📮 CTLsend: ' + msg)
          }
          this.peerConnection?.ctlChannel.send(msg)
        }
      },
      async (...args: Parameters<typeof masterRoutine>) => {
        try {
          return await masterRoutine(...args)
        } catch (e) {
          this.logger.error(eToStr(e))
        }
      },
      { fch: this, ctlChannelId: this.peerConnection?.chatChannel.id }
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
    return this._peerState.connectionStatus
  }
  private set connectionStatus(status: FriendConnectionStatus) {
    if (this._peerState.connectionStatus == 'closed') {
      return // ignore
      // throw new Error("Can't change closed connection status")
    }

    const hasChanged = status != this._peerState.connectionStatus
    switch (status) {
      case 'encrypted-connected':
      case 'unencrypted-connected': {
        this._peerState = {
          ...this._peerState,
          connectionStatus: status
        }
        break
      }
      case 'online-disconnected':
      case 'failed':
      case 'offline':
      case 'unknown':
      case 'do-not-connect':
      case 'rejected':
      case 'connecting':
      case 'closed':
      case 'unset': {
        this.controlChannelTransactionHandler?.clear()
        this._peerState = {
          connectionStatus: status,
          capabilities: null,
          encryptionAttempts: 0
        }
        this.encryptionParams = null
        break
      }
      default:
        assertNever(status)
    }
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
      case 'unencrypted-connected':
      case 'closed':
      case 'unset':
      case 'encrypted-connected':
        break
      default:
        assertNever(status)
    }
  }

  public get capabilities() {
    return this._peerState.capabilities
  }

  private set capabilities(capabilities) {
    this._peerState.capabilities = capabilities
    /**@todo fire listener */
  }

  public async getECDHPublicKey() {
    const ecdh = createECDH('prime256v1')
    ecdh.generateKeys()

    if (this.encryptionParams?.peerECDHPublicKey) {
      const secret = ecdh.computeSecret(this.encryptionParams.peerECDHPublicKey)

      this.encryptionParams = {
        ecdh: ecdh,
        AESKey: await this.deriveAESKey(secret),
        peerECDHPublicKey: this.encryptionParams.peerECDHPublicKey,
        peerHasReceivedPublicKey: false
      }
    } else {
      this.encryptionParams = {
        ecdh: ecdh,
        AESKey: null,
        peerECDHPublicKey: null,
        peerHasReceivedPublicKey: false
      }
    }
    return ecdh.getPublicKey()
  }

  public confirmPeerHasReceivedECDHPublicKey() {
    if (!this.encryptionParams?.ecdh) {
      this.logger.error("Peer has our Elyptic Curve Diffie-Hellman public key, yet we don't?")
      return
    }
    this.encryptionParams = {
      ...this.encryptionParams,
      peerHasReceivedPublicKey: true
    }
    if (this.encryptionParams.AESKey) {
      this.connectionStatus = 'encrypted-connected'
      this.logger.info('CTL channel is now encrypted')
    }
  }

  private async setECDHPeerPublicKey(key: Buffer) {
    if (this.encryptionParams?.ecdh) {
      const secret = this.encryptionParams.ecdh.computeSecret(key)
      this.encryptionParams = {
        ecdh: this.encryptionParams.ecdh,
        peerECDHPublicKey: key,
        AESKey: await this.deriveAESKey(secret),
        peerHasReceivedPublicKey:
          this.encryptionParams == null ? false : this.encryptionParams.peerHasReceivedPublicKey
      }
      if (this.encryptionParams.peerHasReceivedPublicKey) {
        this.connectionStatus = 'encrypted-connected'
        this.logger.info('CTL channel is now encrypted')
      }
    } else {
      this.encryptionParams = {
        ecdh: null,
        AESKey: null,
        peerECDHPublicKey: key,
        peerHasReceivedPublicKey: false
      }
    }
  }

  private encryptionError(e: Error | string) {
    this.logger.warn(`Encryption error: ${e}. Closing peer connection.`)
    this.connectionStatus = 'failed'
    this.peerConnection?.removeAllListeners()
    this.peerConnection?.close()
    this.peerConnection = undefined
  }

  public acceptOrRejectVideoCall = (status: 'accept' | 'reject') => {
    this.onAcceptOrRejectVideoCall?.(status)
  }

  public attemptConnection = () => {
    clearTimeout(this.reconnectTimeout)
    this.reconnectTimeout = undefined
    if (this.paused) {
      this.shouldReconnectWhenUnpaused = true
      return
    }
    this.connectionStatus = 'connecting'
    this.logger.info('Attempting peer connection')
    this.con.initiatePeerConnection(this.friend.peerPk).then((result) => {
      this.receiveConnection(result)
    })
  }

  /**
   * Connection request routine has just been initiated by the peer, and we are accepting the request.
   * Connection has not been set up or anything yet.
   */
  public receiveConnectionRequest = () => {
    // clear timeout
    clearTimeout(this.reconnectTimeout)
    this.reconnectTimeout = undefined

    if (this.peerConnection) {
      this.logger.info('Closing old peer connection to make way for incoming one')
      this.peerConnection.removeAllListeners()
      this.peerConnection.close()
      this.peerConnection = undefined
    }

    this.capabilities = null
    this.encryptionParams = null
    this.connectionStatus = 'connecting'
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
        this.logger.info(
          `Friend connection state is "${this.connectionStatus}", new connections not allowed. Closing new peer connection.`
        )
        result.peerConnection.close()
      }
      return
    }

    // // if we already have a connection and we are receiving a new connection, replace and close the old one.
    // if (
    //   this.connectionStatus == 'encrypted-connected' ||
    //   this.connectionStatus == 'unencrypted-connected'
    // ) {
    //   if (result.status == 'succeed') {
    //     // reassign this.peerConnection first before closing so the event listener for the old channel doesn't change the status when it closes.
    //     this.logger.info('Replacing old peer connection with new one')
    //     const oldPeerConnection = this.peerConnection
    //     this.peerConnection = result.peerConnection
    //     oldPeerConnection?.close()
    //     this.capabilities = null
    //     this.encryptionParams = null
    //   } else {
    //     // ignore the new failed connection. As far as we're concerned, we already have a working connection.
    //     this.logger.info('Ignoring new failed peer connection. We already have a working one.')
    //     return
    //   }
    // }

    switch (result.status) {
      case 'offline':
        this.connectionStatus = 'offline'
        this.logger.info('Peer is offline')
        break
      case 'reject':
        this.connectionStatus = 'rejected'
        this.logger.info('Peer rejected connection')
        // this DOES NOT mean that we should unfriend them - perhaps another friend request is in progress.
        break
      case 'fail':
        this.connectionStatus = 'failed'
        this.logger.error(`Peer connection failed: ${result.msg}`)
        break
      case 'succeed':
        this.connectionStatus = 'unencrypted-connected'
        this.setupSuccessfulPeerConnection(result)
        break

      default:
        assertNever(result)
    }
  }

  private setupSuccessfulPeerConnection(
    result: PeerConnectionCreationResult & { status: 'succeed' }
  ) {
    this.logger.info('Setting up new peer connection')
    this.encryptionParams = null
    this.peerConnection = result.peerConnection
    this.addPeerConnectionListeners(result.peerConnection)

    this.tryEncryptionAsync()

    // get friend's capabilities (async)
    const ctlId = result.peerConnection.ctlChannel.id
    sendGetCapabilities(this)
      .then((capabilities) => {
        // check that the connection has not changed
        if (this.peerConnection?.ctlChannel.id != ctlId) {
          return
        }
        this.capabilities = capabilities
      })
      .catch((e) => this.logger.error(`Could not get capabilities. ${eToStr(e)}`))
  }

  private addPeerConnectionListeners(peerConnection: HarmonyPeerConnection) {
    peerConnection.chatChannel.onMessage.subscribe((msg) => {
      this.onReceiveMessage?.(msg.toString(), null)
    })
    peerConnection.ctlChannel.onMessage.subscribe((msg) => {
      let bufMsg: Buffer
      if (!(msg instanceof Buffer)) {
        bufMsg = Buffer.from(msg)
      } else {
        bufMsg = msg
      }

      if (bufMsg.length > 29 && bufMsg.at(16) == ENCRYPTED_MESSAGE_BYTE) {
        // attempt to decrypt
        try {
          bufMsg = this.decryptMessage(bufMsg)
        } catch (e) {
          const strMsg = bufMsg.toString('utf8')
          if (DEBUG) {
            this.logger.verbose('📬❗ CTLrecv: ' + strMsg)
          }
          this.logger.error(`Could not decode peer's message: ` + strMsg)
          this.encryptionError(eToStr(e))
          return
        }
        if (DEBUG) {
          this.logger.verbose('📬🔓 CTLrecv: ' + bufMsg.toString('utf8'))
        }
      } else {
        // not encrypted
        if (DEBUG) {
          this.logger.verbose('📬 CTLrecv: ' + bufMsg.toString('utf8'))
        }
      }
      ;(async () => {
        try {
          await this.controlChannelTransactionHandler.recv(bufMsg)
        } catch (e) {
          this.logger.warn(`Transaction closed unexpectedly: ${eToStr(e)}`)
        }
      })()
    })
    const onChannelStateChanged: Parameters<
      typeof peerConnection.chatChannel.stateChanged.subscribe
    >[0] = (state) => {
      if (state == 'closing' || state == 'closed') {
        // check chat channel has not changed
        if (this.peerConnection == peerConnection) {
          // in future we could get an explicit disconnect message from the user.
          this.connectionStatus = 'online-disconnected'
          this.logger.info('Disconnected')
          this.controlChannelTransactionHandler.clear()
        }
        peerConnection.removeAllListeners()
      }
    }
    peerConnection.chatChannel.stateChanged.subscribe(onChannelStateChanged)
    peerConnection.ctlChannel.stateChanged.subscribe(onChannelStateChanged)
    peerConnection.rtc.connectionStateChange.subscribe(() => {
      switch (peerConnection.rtc.connectionState) {
        case 'closed':
        case 'failed':
        case 'disconnected': {
          // set to online-disconnected - if the peer connection was still in use
          if (this.peerConnection == peerConnection) {
            this.connectionStatus = 'online-disconnected'
            this.logger.info('Disconnected')
            this.controlChannelTransactionHandler.clear()
            this.peerConnection = undefined
          }
          peerConnection.removeAllListeners()
          peerConnection.close()
          break
        }
        case 'connected': {
          if (this.peerConnection == peerConnection) {
            this.connectionStatus = 'unencrypted-connected'
          }
          break
        }
        case 'new':
        case 'connecting':
          break
      }
    })
  }

  private async tryEncryptionAsync() {
    if (this._peerState.encryptionAttempts > 5) {
      this.logger.info(
        `Attempted to establish encryption ${this._peerState.encryptionAttempts} times. Will not make any more attempts.`
      )
      return
    }
    sendGetECDHPublicKey(this)
      .then((DHPeerPublicKey) => {
        this.setECDHPeerPublicKey(DHPeerPublicKey)
      })
      .catch((e) => {
        this.logger.warn(
          `Couldn't get peer's Elyptic Curve Diffie-Hellman public key. Perhaps they don't support encryption. ${eToStr(e)}`
        )
      })
    this._peerState.encryptionAttempts++
  }

  private encryptMessage(msg: Buffer) {
    if (!this.encryptionParams?.AESKey) {
      throw new Error("Don't have the secret key to encode this message")
    }
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionParams.AESKey, nonce, {
      authTagLength: 16
    })
    const encrypted = cipher.update(msg)
    cipher.final()
    const tag = cipher.getAuthTag()

    const buf = Buffer.alloc(16 + 1 + 12 + encrypted.length)
    tag.copy(buf, 0)
    buf[16] = ENCRYPTED_MESSAGE_BYTE
    nonce.copy(buf, 17)
    encrypted.copy(buf, 29)
    return buf
  }

  private decryptMessage(msg: Buffer) {
    if (msg.length < 29) {
      throw new Error('Encrypted message too short')
    }
    if (!this.encryptionParams?.AESKey) {
      throw new Error("Don't have the secret key to decode this message")
    }
    const tag = Buffer.copyBytesFrom(msg, 0, 16)
    const nonce = Buffer.copyBytesFrom(msg, 17, 12)
    const ciphertext = Buffer.copyBytesFrom(msg, 29)

    const decipher = createDecipheriv('aes-256-gcm', this.encryptionParams.AESKey, nonce)
    decipher.setAuthTag(tag)
    const plaintext = decipher.update(ciphertext)
    try {
      decipher.final()
    } catch (e) {
      throw new Error(
        `Cipher authentication failed. Ciphertext may have been tampered with. ${eToStr(e)}`
      )
    }

    // if we weren't sure whether the peer has received our dh public key, we are now, since they are using it.
    if (this.connectionStatus == 'unencrypted-connected') {
      this.confirmPeerHasReceivedECDHPublicKey()
    }

    return plaintext
  }

  private deriveAESKey(secret: Buffer) {
    return new Promise<Buffer>((resolve, reject) => {
      hkdf('sha512', secret, '', '', 32, (err, derivedKey) => {
        if (err) {
          reject(err)
          return
        }
        resolve(Buffer.from(derivedKey))
      })
    })
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
    this.peerConnection = undefined
  }
}
