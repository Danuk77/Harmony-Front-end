// stores a list of friends and corresponding rtc connections and periodically sends connection requests

import { HarmonyConnection, PeerConnectionCreationResult } from 'node-harmonyclient'
import { Friend } from './LocalDatabase'
import { FriendConnectionHandler, FriendConnectionStatus } from './FriendConnectionHandler'
import { DEBUG } from '.'
import { ICECandidate } from './friendCtlRoutines/VideoCallRoutine'
import { FriendVideoCallStatus, VideoCallManager } from './VideoCallManager'

/**
 * Collection of all friends.
 * Combines methods and callbacks from the friends.
 */
export class FriendRoster {
  // peerPk -> FriendConnectionHandler
  private friends: Map<string, FriendConnectionHandler> = new Map<string, FriendConnectionHandler>()
  private con: HarmonyConnection
  private _paused: boolean = true
  // callbacks
  public onFriendConnectionStatusChange?: (
    publicKey: string,
    status: FriendConnectionStatus
  ) => unknown
  public onVideoCallStatusChange?: (publicKey: string, status: FriendVideoCallStatus) => unknown
  public onReceiveMessage?: (
    publicKey: string,
    msg: string,
    msgNumber: number | null
  ) => Promise<{ status: 'accept' } | { status: 'reject'; reason: string }>
  public onPeerSdpAnswerForVideoCall?: (
    publicKey: string,
    sdpAnswer: { type: 'answer'; sdp: string },
    callID: number
  ) => unknown
  public onPeerIceCandidateForVideoCall?: (
    publicKey: string,
    candidate: ICECandidate,
    callID: number
  ) => unknown

  constructor(con: HarmonyConnection) {
    this.con = con
  }

  /**
   * Pause and resume making connection attempts to friends.
   */
  public set paused(value: boolean) {
    this._paused = value
    for (const friend of this.friends.values()) {
      friend.paused = value
    }
  }
  public get paused() {
    return this._paused
  }

  /**
   * Diff friends
   * IMPORTANT - wanted must be EXACTLY of type Friend[] - no extra properties. This will mess things up
   * @param wanted
   */
  public setFriends = (wanted: Friend[]) => {
    // this also removes duplicate peerPks
    const wantedMap = new Map(wanted.map((friend) => [friend.peerPk, friend]))

    const wantedPks = Array.from(wantedMap.keys())
    const gotPks = Array.from(this.friends.keys())

    // venn diagram
    // only check peer pk. local pk may have changed as well - if so we'll find out in the toUpdate loop
    const toUpdate = wantedPks.filter((pk) => this.friends.has(pk))
    const toDelete = gotPks.filter((pk) => !wantedMap.has(pk))
    const toAdd = wantedPks.filter((pk) => !this.friends.has(pk))

    /**@todo must be certain that the websocket connection has been recreated with the new local pk at this point*/

    for (const pk of toUpdate) {
      const currentHandler = this.friends.get(pk)
      const newFriend = wantedMap.get(pk)

      if (!currentHandler || !newFriend) {
        // just to coerce the types.
        // this should not happen unless the friends somehow change during this function
        throw new Error()
      }

      // check local pk matches
      if (currentHandler.friend.localPk != newFriend.localPk) {
        // if not, recreate the friend with the new local pk
        toDelete.push(pk)
        toAdd.push(pk)
        continue
      }

      currentHandler.friend = newFriend
    }

    for (const pk of toDelete) {
      this.removeFriend(pk)
    }

    for (const pk of toAdd) {
      const friend = wantedMap.get(pk)
      if (friend) {
        this.addOrUpdateFriend(friend)
      }
    }
  }

  /**
   * Add a new friend for connections, or update the friend
   * Returns true if the friend already existed
   * @param friend
   */
  public addOrUpdateFriend = (friend: Friend) => {
    const existingFriendHandler = this.friends.get(friend.peerPk)

    if (existingFriendHandler) {
      existingFriendHandler.friend = friend
      return true
    } else {
      const friendHandler = new FriendConnectionHandler(this.con, friend, {
        onConnectionStatusChange: (connectionStatus) =>
          this.onFriendConnectionStatusChange?.(friend.peerPk, connectionStatus),
        onVideoCallStatusChange: (videoCallStatus) =>
          this.onVideoCallStatusChange?.(friend.peerPk, videoCallStatus),
        onReceiveMessage: (msg, msgNumber) =>
          this.onReceiveMessage?.(friend.peerPk, msg, msgNumber),
        onPeerSdpAnswerForVideoCall: (sdpAnswer, callID) =>
          this.onPeerSdpAnswerForVideoCall?.(friend.peerPk, sdpAnswer, callID),
        onPeerIceCandidateForVideoCall: (candidate, callID) =>
          this.onPeerIceCandidateForVideoCall?.(friend.peerPk, candidate, callID)
      })
      this.friends.set(friend.peerPk, friendHandler)
      friendHandler.paused = this.paused
      return false
    }
  }
  /**
   * Partially update a friend.
   * @param fields
   * @returns
   */
  public updateFriend = (fields: Pick<Friend, 'peerPk'> & Partial<Friend>) => {
    const existingFriendHandler = this.friends.get(fields.peerPk)
    if (existingFriendHandler) {
      existingFriendHandler.friend = {
        ...existingFriendHandler.friend,
        ...fields
      }
      return true
    } else {
      return false
    }
  }

  /**
   * Remove a friend, if they exist. If not, this function has no effect.
   * @param publicKey
   */
  public removeFriend = (publicKey: string) => {
    const friendWrapper = this.friends.get(publicKey)
    if (friendWrapper) {
      friendWrapper.close()
      this.friends.delete(publicKey)
    }
  }

  public receiveConnection = (result: PeerConnectionCreationResult) => {
    const friendWrapper = this.friends.get(result.publicKey)
    if (friendWrapper) {
      friendWrapper.receiveConnection(result)
    } else {
      if (DEBUG)
        console.error('Recieved a connection from an unknown friend, closing. ' + result.publicKey)
      result.peerConnection?.close()
    }
  }

  public forceFriendReconnect = (publicKey: string) => {
    const friendHandler = this.friends.get(publicKey)
    if (!friendHandler) {
      throw new Error('Friend does not exist')
    }
    if (friendHandler.friend.status != 'accept') {
      throw new Error('Friend request not accepted')
    }
    friendHandler.attemptConnection()
  }

  // public getFriendConnectionStatus = (publicKey: string) => {
  //   return this.friends.get(publicKey)?.connectionStatus
  // }

  /**
   * Attempt to send a message to the specified friend. Throws an error if unsuccessful.
   * @param publicKey
   * @param msg
   */
  public sendMessage = async (publicKey: string, msg: string, msgNumber: number) => {
    const friendHandler = this.friends.get(publicKey)
    if (!friendHandler) {
      throw new Error('Friend does not exist')
    }
    await friendHandler.sendMessage(msg, msgNumber) // might throw an error.
  }

  public forwardICECandidateForVideoCall(pk: string, candidate: ICECandidate, callID: number) {
    const friend = this.friends.get(pk)
    if (friend && friend.videoCallManager.routineManager.currentSignalling?.id == callID) {
      friend.videoCallManager.routineManager.forwardICECandidateForVideoCall(candidate)
    }
  }

  public hangUpAndCloseVideoCall(
    pk: string,
    ...args: Parameters<VideoCallManager['hangUpAndClose']>
  ) {
    const friend = this.friends.get(pk)
    if (friend) {
      friend.videoCallManager.hangUpAndClose(...args)
    }
  }

  public errorVideoCall(pk: string, ...args: Parameters<VideoCallManager['error']>) {
    const friend = this.friends.get(pk)
    if (friend) {
      friend.videoCallManager.error(...args)
    }
  }

  public signallingCompleteVideoCall(
    pk: string,
    ...args: Parameters<VideoCallManager['signallingComplete']>
  ) {
    const friend = this.friends.get(pk)
    if (friend) {
      friend.videoCallManager.signallingComplete(...args)
    }
  }

  public peerHangsUpVideoCall(pk: string, ...args: Parameters<VideoCallManager['peerHangsUp']>) {
    const friend = this.friends.get(pk)
    if (friend) {
      friend.videoCallManager.peerHangsUp(...args)
    }
  }

  public weAcceptVideoCall(pk: string, ...args: Parameters<VideoCallManager['weAccept']>) {
    const friend = this.friends.get(pk)
    if (friend) {
      friend.videoCallManager.weAccept(...args)
    }
  }

  public sendVideoCallRequest(
    pk: string,
    ...args: Parameters<VideoCallManager['sendVideoCallRequest']>
  ) {
    const friend = this.friends.get(pk)
    if (friend) {
      friend.videoCallManager.sendVideoCallRequest(...args)
    }
  }

  public videoCallWindowOpens(pk: string, ...args: Parameters<VideoCallManager['windowOpens']>) {
    const friend = this.friends.get(pk)
    if (friend) {
      friend.videoCallManager.windowOpens(...args)
    }
  }

  /**
   * Gracefully close all rtc connections
   */
  public closeAll = () => {
    for (const friend of this.friends.values()) {
      friend.close()
    }
  }
}
