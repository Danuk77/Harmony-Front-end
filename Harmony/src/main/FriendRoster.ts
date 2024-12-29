// stores a list of friends and corresponding rtc connections and periodically sends connection requests

import { HarmonyConnection } from './connection/HarmonyConnection'
import { Friend } from './LocalDatabase'
import { FriendConnectionStatus, FriendConnectionHandler } from './FriendConnectionHandler'
import { PeerConnectionCreationResult } from './connection/model/HarmonyPeerConnection'
import { DEBUG } from '.'

/**
 * Collection of all friends.
 * Combines methods and callbacks from the friends.
 */
export class FriendRoster {
  private friends: Map<string, FriendConnectionHandler> = new Map<string, FriendConnectionHandler>()
  private con: HarmonyConnection
  private _paused: boolean = true

  constructor(con: HarmonyConnection) {
    this.con = con
  }

  // callbacks
  public onFriendConnectionStatusChange?: (
    publicKey: string,
    status: FriendConnectionStatus
  ) => unknown
  public onReceiveMessage?: (publicKey: string, msg: string) => unknown

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
   * Add a new friend for connections, or update the friend
   * @param friend
   */
  public addOrUpdateFriend = (friend: Friend) => {
    const existingFriendHandler = this.friends.get(friend.peerPk)

    if (existingFriendHandler) {
      existingFriendHandler.friend = friend
    } else {
      const friendHandler = new FriendConnectionHandler(
        this.con,
        friend,
        (status) => this.onFriendConnectionStatusChange?.(friend.peerPk, status),
        (msg) => this.onReceiveMessage?.(friend.peerPk, msg)
      )
      this.friends.set(friend.peerPk, friendHandler)
      friendHandler.paused = this.paused
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
      result.peerConnection?.rtc.close()
    }
  }

  // public getFriendConnectionStatus = (publicKey: string) => {
  //   return this.friends.get(publicKey)?.connectionStatus
  // }

  /**
   * Attempt to send a message to the specified friend. Throws an error if unsuccessful.
   * @param publicKey
   * @param msg
   */
  public sendMessage = (publicKey: string, msg: string) => {
    const friendHandler = this.friends.get(publicKey)
    if (!friendHandler) {
      throw new Error('Friend does not exist')
    }
    friendHandler.sendMessage(msg) // might throw an error.
  }
}
