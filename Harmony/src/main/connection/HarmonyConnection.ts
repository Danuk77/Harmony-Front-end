/**
 * Facade for code in this directory.
 */

import {
  HarmonyWebsocketConnection,
  HarmonyWebsocketConnectionOptions
} from './model/HarmonyWebsocketConnection'
import { initiatePeerConnection } from './routines/initiated/initiatePeerConnection'
import { sendFriendRejection } from './routines/initiated/sendFriendRejection'
import { sendFriendRequest } from './routines/initiated/sendFriendRequest'

export class HarmonyConnection {
  private websocket: HarmonyWebsocketConnection

  /**
   * Class containing all methods needed to interact with the signalling server.
   * @param publicKey This client's public key
   * @param websocketConnectionOptions Additional options for the websocket.
   */
  constructor(
    publicKey: string | null,
    websocketConnectionOptions?: HarmonyWebsocketConnectionOptions
  ) {
    // create websocket
    this.websocket = new HarmonyWebsocketConnection(publicKey, websocketConnectionOptions)
  }

  public get wsStatus() {
    return this.websocket.wsStatus
  }

  public set publicKey(publicKey: string | null) {
    this.websocket.publicKey = publicKey
  }
  public get publicKey() {
    return this.websocket.publicKey
  }

  /**
   * Callback for when the websocket connection status has changed
   */
  public set onWsStatusChange(callback) {
    this.websocket.onWsStatusChange = callback
  }
  public get onWsStatusChange() {
    return this.websocket.onWsStatusChange
  }

  /**
   * Callback for when the `comeOnline` routine fails for any reason.
   */
  public set onFailedLogin(callback) {
    this.websocket.onFailedLogin = callback
  }
  public get onFailedLogin() {
    return this.websocket.onFailedLogin
  }

  /**
   * Callback to accept/reject incoming connection requests.
   */
  public set onIncomingConnectionRequest(callback) {
    this.websocket.onIncomingConnectionRequest = callback
  }
  public get onIncomingConnectionRequest() {
    return this.websocket.onIncomingConnectionRequest
  }
  /**
   * Callback returning the result of accepted incoming connection requests. If successful, the result contains the WebRTC data channel created.
   */
  public set onIncomingConnectionResult(callback) {
    this.websocket.onIncomingConnectionResult = callback
  }
  public get onIncomingConnectionResult() {
    return this.websocket.onIncomingConnectionResult
  }

  /**
   * Callback for when a message is sent to the signalling server.
   * For monitoring/logging purposes.
   */
  public set onSendMessage(callback) {
    this.websocket.onSendMessage = callback
  }
  public get onSendMessage() {
    return this.websocket.onSendMessage
  }
  /**
   * Callback for when a message is received from the signalling server.
   * For monitoring/logging purposes.
   */
  public set onReceiveMessage(callback) {
    this.websocket.onReceiveMessage = callback
  }
  public get onReceiveMessage() {
    return this.websocket.onReceiveMessage
  }
  /**
   * Callback to accept/reject/defer(pending) incoming friend requests.
   */
  public set onReceiveFriendRequest(callback) {
    this.websocket.onReceiveFriendRequest = callback
  }
  public get onReceiveFriendRequest() {
    return this.websocket.onReceiveFriendRequest
  }
  /**
   * Callback for when a friend rejection message is received.
   */
  public set onReceiveFriendRejection(callback) {
    this.websocket.onReceiveFriendRejection = callback
  }
  public get onReceiveFriendRejection() {
    return this.websocket.onReceiveFriendRejection
  }

  /**
   * Connect and login to the signalling server.
   * @returns
   */
  public reconnect = () => this.websocket.reconnect()

  /**
   * Close the websocket connection to the signalling server.
   * @returns
   */
  public close = () => this.websocket.close()

  /**
   * Attempt to create a WebRTC connection with the peer.
   * @param peerPublicKey
   * @returns
   */
  public initiatePeerConnection = (peerPublicKey: string) =>
    initiatePeerConnection(this.websocket, peerPublicKey)

  /**
   * Attempt to send a friend rejection message to the peer.
   * @param peerPublicKey
   * @return
   */
  public sendFriendRejection = (peerPublicKey: string) =>
    sendFriendRejection(this.websocket, peerPublicKey)

  /**
   * Attempt to send a friend request to the peer.
   * @param peerPublicKey
   * @returns
   */
  public sendFriendRequest = (peerPublicKey: string) =>
    sendFriendRequest(this.websocket, peerPublicKey)
}
