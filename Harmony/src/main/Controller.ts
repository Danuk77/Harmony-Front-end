/**
 * Links the database, con, and friend roster.f
 */

import { DEBUG } from '.'
import { FriendWithState, MainToRendererAction } from '../preload'
import { HarmonyConnection } from './connection/HarmonyConnection'
import { WebsocketStatusType } from './connection/model/HarmonyWebsocketConnection'
import { FriendRequestResult } from './connection/routines/initiated/sendFriendRequest'
import { FriendRoster } from './FriendRoster'
import { Friend, LocalDatabase, Message } from './LocalDatabase'
import { storeTypesafe } from './redux/store'

export type SendMessageReturnType =
  | {
      msg: Message
      error?: string
    }
  | {
      msg: null
      error: string
    }

export type ControllerState = {
  connection: {
    status: WebsocketStatusType
  }
  friends: FriendWithState[]
}

// links database and connections.
export class Controller {
  private friendRoster: FriendRoster
  private con: HarmonyConnection
  public db: LocalDatabase
  private publicKey: string

  // callback for IPCs to be sent to the renderer.
  public onMainToRendererAction?: (arg0: MainToRendererAction) => unknown

  constructor(publicKey: string) {
    this.publicKey = publicKey
    this.db = new LocalDatabase()
    this.con = new HarmonyConnection(publicKey)
    this.friendRoster = new FriendRoster(this.con)

    // con listeners
    this.con.onFailedLogin = (reason) => {
      this.onMainToRendererAction?.({
        type: 'failed-login',
        payload: {
          reason: reason
        }
      })
    }

    this.con.onIncomingConnectionRequest = async (pk) => {
      const friend = await this.db.getFriend(this.publicKey, pk)
      if (friend && friend.status == 'accept') {
        return 'accept'
        /**@todo maybe inform the renderer?*/
      } else {
        return 'reject'
      }
    }

    this.con.onIncomingConnectionResult = (result) => {
      this.friendRoster.receiveConnection(result)
      // this leads to a friendRoster.onFriendConnectionStatusChange callback; don't need to inform the front end from here.
    }

    this.con.onReceiveFriendRejection = async (pk) => {
      const friend = await this.db.getFriend(this.publicKey, pk)
      let updatedFriend: Friend

      // update the friend
      if (friend) {
        const updatedFields = {
          status: 'reject' as const,
          statusModified: new Date(Date.now())
        }
        await this.db.updateFriend({
          localPk: this.publicKey,
          peerPk: pk,
          ...updatedFields
        })
        updatedFriend = { ...friend, ...updatedFields }

        // update the state
        storeTypesafe.dispatch({ type: 'friend-change', payload: updatedFriend })
      } else {
        updatedFriend = {
          localPk: this.publicKey,
          peerPk: pk,
          status: 'reject',
          statusModified: new Date(Date.now()),
          nickname: pk
        }
        await this.db.insertFriend(updatedFriend)

        storeTypesafe.dispatch({
          type: 'add-friend',
          payload: { ...updatedFriend, connectionStatus: 'unset' }
        })
      }

      // tell the friend roster
      this.friendRoster.addOrUpdateFriend(updatedFriend)
    }
    this.con.onReceiveFriendRequest = async (pk) => {
      const friend = await this.db.getFriend(this.publicKey, pk)
      if (friend) {
        switch (friend.status) {
          case 'reject':
            {
              const update = {
                localPk: this.publicKey,
                peerPk: pk,
                status: 'pending' as const,
                statusModified: new Date(Date.now())
              }
              await this.db.updateFriend(update)
              this.friendRoster.updateFriend(update)

              // tell the renderer
              storeTypesafe.dispatch({
                type: 'friend-change',
                payload: update
              })

              /**@todo send notification */
            }
            return 'pending'
          case 'accept':
            return 'accept'
          case 'pending':
            return 'pending'
          case 'block':
            return 'reject'
          case 'awaiting-response':
            {
              const update = {
                localPk: this.publicKey,
                peerPk: pk,
                status: 'accept' as const,
                statusModified: new Date(Date.now())
              }
              await this.db.updateFriend(update)
              this.friendRoster.updateFriend(update)

              // tell the renderer
              storeTypesafe.dispatch({
                type: 'friend-change',
                payload: update
              })

              /**@todo send notification */
            }
            return 'accept'
        }
      } else {
        // insert a new friend obj
        const newFriend: Friend = {
          localPk: this.publicKey,
          peerPk: pk,
          status: 'pending',
          nickname: pk,
          statusModified: new Date(Date.now())
        }
        await this.db.insertFriend(newFriend)

        // tell the renderer
        storeTypesafe.dispatch({
          type: 'add-friend',
          payload: { ...newFriend, connectionStatus: 'unset' }
        })

        this.friendRoster.addOrUpdateFriend(newFriend)

        return 'pending'
      }
    }
    if (DEBUG) {
      this.con.onSendMessage = (msg) => {
        console.log('📮 WSsend: ' + msg)
      }
      this.con.onReceiveMessage = (msg) => {
        console.log('📬 WSrecv: ' + msg)
      }
    }
    this.con.onWsStatusChange = (status) => {
      // send a message to the renderer
      storeTypesafe.dispatch({
        type: 'websocket-status-change',
        payload: status
      })
      if (status == 'logged-in') {
        // start connecting to friends
        this.friendRoster.paused = false
      } else {
        this.friendRoster.paused = true
      }
    }

    // friend roster listeners
    this.friendRoster.onReceiveMessage = (pk, msg) => {
      const msgObj: Message = {
        date: new Date(Date.now()),
        fromPk: pk,
        toPk: this.publicKey,
        text: msg
      }

      // write message to database
      this.db.insertMessage(msgObj)

      // update renderer
      this.onMainToRendererAction?.({
        type: 'receive-message',
        payload: msgObj
      })
      /**@todo send notification */
    }

    this.friendRoster.onFriendConnectionStatusChange = (peerPk, status) => {
      storeTypesafe.dispatch({
        type: 'friend-change',
        payload: {
          localPk: this.publicKey,
          peerPk: peerPk,
          connectionStatus: status
        }
      })
    }

    // start websocket connection initiation
    this.con.reconnect()

    // on startup, add all friends to the friend roster.
    this.db.getAllFriends().then((friends) => {
      for (const friend of friends) {
        // send to front end
        storeTypesafe.dispatch({
          type: 'add-friend',
          payload: {
            ...friend,
            connectionStatus: 'unset'
          }
        })
        this.friendRoster.addOrUpdateFriend(friend)
      }
    })
  }
  /**
   * Send a message to a peer, update the database, return a message to the front end.
   */
  public sendMessage = async (
    fromPk: string,
    toPk: string,
    message: string
  ): Promise<SendMessageReturnType> => {
    // send message
    try {
      this.friendRoster.sendMessage(toPk, message)
    } catch (e) {
      console.error(eToStr(e))
      return {
        msg: null,
        error: 'Failed to send message: ' + eToStr(e)
      }
    }

    const msgObj: Message = {
      date: new Date(Date.now()),
      fromPk: fromPk,
      toPk: toPk,
      text: message
    }

    // insert into database.
    try {
      await this.db.insertMessage(msgObj)
    } catch (e) {
      console.error(eToStr(e))
      this.onMainToRendererAction?.({
        type: 'error',
        payload: { msg: 'Failed to add message to local database: ' + eToStr(e) }
      })
    }

    return { msg: msgObj }
  }

  /**
   * Send a friend request to a peer, update the database, return a message to the front end.
   * Also issues friend-change actions to the renderer.
   */
  public sendFriendRequest = async (
    localPk: string,
    peerPk: string
  ): Promise<FriendRequestResult> => {
    let result: FriendRequestResult
    try {
      result = await this.con.sendFriendRequest(peerPk)
    } catch (e) {
      console.error(eToStr(e))
      return {
        status: 'fail',
        msg: 'Failed to send friend request: ' + eToStr(e)
      }
    }

    if (result.status == 'fail') {
      console.error(result.msg)
      return result
    }
    if (result.status == 'offline') {
      return result
    }

    // new friend status depends on response from peer
    let newStatus: Friend['status']
    switch (result.type) {
      case 'accept':
        newStatus = 'accept'
        break
      case 'reject':
        newStatus = 'reject'
        break
      case 'pending':
        newStatus = 'awaiting-response'
        break
    }

    // update db and friend roster
    // check if friend already exists
    /**@todo this might cause an error */
    let friendObj = await this.db.getFriend(localPk, peerPk)
    if (friendObj) {
      const friendUpdate = {
        peerPk,
        localPk,
        status: newStatus,
        statusModified: new Date(Date.now())
      }
      // tell the front end
      storeTypesafe.dispatch({
        type: 'friend-change',
        payload: friendUpdate
      })

      // edit friend roster
      this.friendRoster.updateFriend(friendUpdate)

      // edit database
      try {
        await this.db.updateFriend(friendUpdate)
      } catch (e) {
        this.onMainToRendererAction?.({
          type: 'error',
          payload: {
            msg: 'Failed to edit local database: ' + eToStr(e)
          }
        })
        console.error(eToStr(e))
      }
    } else {
      friendObj = {
        localPk: localPk,
        peerPk: peerPk,
        nickname: localPk,
        status: newStatus,
        statusModified: new Date(Date.now())
      }

      // tell the front end
      storeTypesafe.dispatch({
        type: 'add-friend',
        payload: { ...friendObj, connectionStatus: 'unset' }
      })

      // add to friend roster
      this.friendRoster.addOrUpdateFriend(friendObj)

      // add to database
      try {
        await this.db.insertFriend(friendObj)
      } catch (e) {
        this.onMainToRendererAction?.({
          type: 'error',
          payload: {
            msg: 'Failed to edit local database: ' + eToStr(e)
          }
        })
        console.error(eToStr(e))
      }
    }
    return result
  }

  public sendFriendRejection = async (localPk: string, peerPk: string) => {
    const result = await this.con.sendFriendRejection(peerPk)
    // in all cases we want to prevent the friend from connecting to us.
    // update the friend roster and databse.
    /**@todo next line might raise an error */
    const friendObj = await this.db.getFriend(localPk, peerPk)
    if (friendObj) {
      const friendUpdate = {
        localPk: localPk,
        peerPk: peerPk,
        status: 'block' as const,
        statusModified: new Date(Date.now())
      }

      // inform front ends
      storeTypesafe.dispatch({
        type: 'friend-change',
        payload: friendUpdate
      })

      // update friend roster
      this.friendRoster.updateFriend(friendUpdate)

      // update local db
      try {
        await this.db.updateFriend(friendUpdate)
      } catch (e) {
        this.onMainToRendererAction?.({
          type: 'error',
          payload: { msg: 'Failed to edit local database: ' + eToStr(e) }
        })
        console.error(eToStr(e))
      }
    } else {
      const friend: Friend = {
        localPk,
        peerPk,
        nickname: peerPk,
        status: 'block',
        statusModified: new Date(Date.now())
      }
      // inform front end
      storeTypesafe.dispatch({
        type: 'add-friend',
        payload: { ...friend, connectionStatus: 'do-not-connect' }
      })

      // add to friend roster
      this.friendRoster.addOrUpdateFriend(friend)

      // update local db
      try {
        await this.db.insertFriend(friend)
      } catch (e) {
        this.onMainToRendererAction?.({
          type: 'error',
          payload: { msg: 'Failed to edit local database: ' + eToStr(e) }
        })
        console.error(eToStr(e))
      }
    }

    return result
  }
}

/**
 * Convert an error (from a try...catch statement) to a string
 * https://stackoverflow.com/a/62611888
 * @param e
 * @returns
 */
export function eToStr(e: unknown): string {
  if (typeof e === 'string') {
    return e
  } else if (e instanceof Error) {
    return e.message
  } else {
    return ''
  }
}
