/**
 * Links the database, con, and friend roster.f
 */

import { DEBUG } from '.'
import { Action } from '../common/redux'
import { FriendWithState, MainToRendererAction } from '../preload'
import { backendURL } from './connection/config'
import { HarmonyConnection } from './connection/HarmonyConnection'
import { WebsocketStatusType } from './connection/model/HarmonyWebsocketConnection'
import { FriendRequestResult } from './connection/routines/initiated/sendFriendRequest'
import { FriendRoster } from './FriendRoster'
import { Friend, LocalDatabase, Message } from './LocalDatabase'
import { getFriendState, startAppListening, storeTypesafe } from './redux'

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
  private _publicKey: string | null = null

  // callback for IPCs to be sent to the renderer.
  public onMainToRendererAction?: (arg0: MainToRendererAction) => unknown

  constructor() {
    this.db = new LocalDatabase()
    this.con = new HarmonyConnection(null)
    this.friendRoster = new FriendRoster(this.con)

    // Setting the local pk is what kicks everything off.
    // The redux store is the source of truth for the local public key.
    // At the end of this constructor method, a redux action is dispatched to set the pk.
    // this.publicKey is then set by redux middleware.
    // The setter for this.publicKey then dispatches another redux action to add the friends to the redux state.
    // Once again, this is intercepted by redux middleware, and the friends are added to the friend roster.
    // The friend roster starts attempting to connect to those friends when a server websocket connection is established and logged-in.

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
      if (!this.publicKey) return 'reject'

      const friend = getFriendState(this.publicKey, pk)?.friend

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
      if (!this.publicKey) return

      const friend = getFriendState(this.publicKey, pk)?.friend
      let updatedFriend: Friend

      // update the friend
      if (friend) {
        const updatedFields = {
          status: 'reject' as const,
          statusModified: Date.now()
        }
        updatedFriend = { ...friend, ...updatedFields }

        // update the state
        storeTypesafe.dispatch({ type: 'friend-change', payload: { friend: updatedFriend } })
      } else {
        updatedFriend = {
          localPk: this.publicKey,
          peerPk: pk,
          status: 'reject',
          statusModified: Date.now(),
          nickname: pk
        }

        storeTypesafe.dispatch({
          type: 'add-friend',
          payload: updatedFriend
        })
      }
    }
    this.con.onReceiveFriendRequest = async (pk) => {
      if (!this.publicKey) {
        return 'reject'
      }

      const friend = getFriendState(this.publicKey, pk)?.friend
      if (friend) {
        switch (friend.status) {
          case 'reject':
            {
              const update = {
                localPk: this.publicKey,
                peerPk: pk,
                status: 'pending' as const,
                statusModified: Date.now()
              }

              // tell the renderer
              storeTypesafe.dispatch({
                type: 'friend-change',
                payload: { friend: update }
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
                statusModified: Date.now()
              }

              // tell the renderer
              storeTypesafe.dispatch({
                type: 'friend-change',
                payload: { friend: update }
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
          statusModified: Date.now()
        }

        // tell the renderer
        storeTypesafe.dispatch({
          type: 'add-friend',
          payload: newFriend
        })

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
        date: Date.now(),
        fromPk: pk,
        toPk: 'local',
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
        type: 'friend-connection-status-change',
        payload: {
          friend: {
            peerPk: peerPk
          },
          connectionStatus: status
        }
      })
    }

    //update friend roster and database when redux store changes
    // redux store is considered the main source of truth
    // so only update the redux store and the rest should be done automatically
    startAppListening({
      predicate: (_action) => {
        const action = _action as Action
        return (
          action.type == 'add-friend' ||
          action.type == 'friend-change' ||
          action.type == 'remove-friend' ||
          action.type == 'hydrate-friends' ||
          action.type == 'set-local-pk' ||
          action.type == 'set-server-url' ||
          action.type == 'set-server-enabled'
        )
      },
      effect: (_action) => {
        const action = _action as Action // typescript is dumb
        switch (action.type) {
          case 'add-friend':
            this.friendRoster.addOrUpdateFriend(action.payload)
            this.db.insertFriend(action.payload)
            break
          case 'friend-change':
            this.friendRoster.updateFriend(action.payload.friend)
            this.db.updateFriend(action.payload.friend)
            break
          case 'remove-friend':
            this.friendRoster.removeFriend(action.payload.peerPk)
            /**@todo delete friend from database! */
            break
          case 'hydrate-friends':
            this.friendRoster.setFriends(action.payload)
            break
          case 'set-local-pk':
            this.publicKey = action.payload
            this.db.setLocalPublicKey(action.payload)
            break
          case 'set-server-url':
            this.con.websocketUrl = action.payload
            /**@todo update db */
            break
          case 'set-server-enabled':
            this.con.enabled = action.payload
            console.log('server enableld: ' + action.payload)
        }
      }
    })

    // set enabled
    storeTypesafe.dispatch({ type: 'set-server-enabled', payload: true })

    // set backend url
    storeTypesafe.dispatch({ type: 'set-server-url', payload: backendURL })

    // set local pk, which kick-starts everything
    this.db.getLocalPublicKey().then((pk) => {
      storeTypesafe.dispatch({ type: 'set-local-pk', payload: pk })
    })
  }
  /**
   * Send a message to a peer, update the database, return a message to the front end.
   */
  public sendMessage = async (toPk: string, message: string): Promise<SendMessageReturnType> => {
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
      date: Date.now(),
      fromPk: 'local',
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
    peerPk: string,
    nickname: string
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
    let friendObj = getFriendState(localPk, peerPk)?.friend
    if (friendObj) {
      const friendUpdate = {
        peerPk,
        localPk,
        nickname,
        status: newStatus,
        statusModified: Date.now()
      }
      // tell the front end
      storeTypesafe.dispatch({
        type: 'friend-change',
        payload: { friend: friendUpdate }
      })
    } else {
      friendObj = {
        localPk: localPk,
        peerPk: peerPk,
        nickname: nickname,
        status: newStatus,
        statusModified: Date.now()
      }

      // tell the front end
      storeTypesafe.dispatch({
        type: 'add-friend',
        payload: friendObj
      })
    }
    return result
  }

  public sendFriendRejection = async (localPk: string, peerPk: string) => {
    const result = await this.con.sendFriendRejection(peerPk)
    // in all cases we want to prevent the friend from connecting to us.
    // update the friend roster and databse.
    /**@todo next line might raise an error */
    const friendObj = getFriendState(localPk, peerPk)?.friend
    if (friendObj) {
      const friendUpdate = {
        localPk: localPk,
        peerPk: peerPk,
        status: 'block' as const,
        statusModified: Date.now()
      }

      // inform front ends
      storeTypesafe.dispatch({
        type: 'friend-change',
        payload: { friend: friendUpdate }
      })
    } else {
      const friend: Friend = {
        localPk,
        peerPk,
        nickname: peerPk,
        status: 'block',
        statusModified: Date.now()
      }
      // inform front end
      storeTypesafe.dispatch({
        type: 'add-friend',
        payload: friend
      })
    }

    return result
  }

  public set publicKey(publicKey: string | null) {
    this._publicKey = publicKey
    this.con.publicKey = publicKey
    console.log(publicKey)

    if (publicKey) {
      // update friend roster with correct friends
      this.db.getAllFriends(publicKey).then((friends) => {
        storeTypesafe.dispatch({ type: 'hydrate-friends', payload: friends })
      })
    } else {
      // clear friends
      storeTypesafe.dispatch({ type: 'hydrate-friends', payload: [] })
    }
  }

  public get publicKey() {
    return this._publicKey
  }

  /**
   * Gracefully stop everything
   */
  public close() {
    this.friendRoster.closeAll()
    this.con.close()
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
