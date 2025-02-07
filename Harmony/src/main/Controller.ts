/**
 * Links the database, con, and friend roster.f
 */

import { DEBUG } from '.'
import { Action } from '../common/redux'
import { FriendWithState, MainToRendererAction } from '../preload'
import { HarmonyConnection } from './connection/HarmonyConnection'
import { WebsocketStatusType } from './connection/model/HarmonyWebsocketConnection'
import { FriendRequestResult } from './connection/routines/initiated/sendFriendRequest'
import { FriendRoster } from './FriendRoster'
import { Friend, LocalDatabase, Message } from './LocalDatabase'
import { getFriendState, startAppListening, store, storeTypesafe } from './redux'

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
  // callback for system notifications
  public onNotification?: (
    notification: Electron.NotificationConstructorOptions,
    dontShowIfFocused: boolean
  ) => unknown

  constructor() {
    this.db = new LocalDatabase()
    this.con = new HarmonyConnection()
    this.friendRoster = new FriendRoster(this.con)

    // How the Controller works: the redux store is the source of truth.
    // In this constructor, middleware is created to intercept redux actions and update everything here based on that.
    // At the end of this constructor, the redux action hydrate-user sets everything going.

    // con listeners
    this.con.onFailedLogin = (reason) => {
      storeTypesafe.dispatch({ type: 'set-failed-login-msg', payload: reason })
    }

    this.con.onIncomingConnectionRequest = async (pk) => {
      if (!this.publicKey) return 'reject'

      const friend = getFriendState(this.publicKey, pk)?.friend

      if (friend && friend.status == 'accept') {
        return 'accept'
        /**@todo maybe inform the renderer?*/
      } else if (friend && friend.status == 'block') {
        // if we have blocked them, send an explicit friend rejection message
        // after a short delay to reduce likelihood of race condition in peer client of the friend status of this client
        ;((localPk) => setTimeout(() => this.sendFriendRejection(localPk, pk), 1000))(
          this.publicKey
        )

        return 'reject'
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
          nickname: pk,
          hasUnreadMessages: false
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

              storeTypesafe.dispatch({
                type: 'friend-change',
                payload: { friend: update }
              })

              this.onNotification?.(
                { title: 'Received friend request', body: friend.nickname + ' (' + pk + ')' },
                true
              )
            }
            return 'pending'
          case 'accept':
            return 'accept'
          case 'pending':
            return 'pending'
          case 'block':
            // if we have blocked them, send an explicit friend rejection message
            // after a short delay to reduce likelihood of race condition in peer client of the friend status of this client
            ;((localPk) => setTimeout(() => this.sendFriendRejection(localPk, pk), 1000))(
              this.publicKey
            )
            return 'reject'
          case 'awaiting-response':
            {
              const update = {
                localPk: this.publicKey,
                peerPk: pk,
                status: 'accept' as const,
                statusModified: Date.now()
              }

              storeTypesafe.dispatch({
                type: 'friend-change',
                payload: { friend: update }
              })

              /**@todo send notification maybe? */
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
          statusModified: Date.now(),
          hasUnreadMessages: false
        }

        // tell the renderer
        storeTypesafe.dispatch({
          type: 'add-friend',
          payload: newFriend
        })

        this.onNotification?.({ title: 'Received friend request', body: pk }, true)

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

      const state = store.getState()

      const notification: Electron.NotificationConstructorOptions = {
        title:
          // friend nickname
          state.user.pk ? (getFriendState(state.user.pk, pk)?.friend.nickname ?? '') : '',
        body: msg
      }

      if (!this.con.publicKey) {
        // type narrowing
        return
      }

      // notification and unread! flag
      if (state.ui.screenMode == 'chat' && state.ui.selectedFriendPk == pk) {
        this.onNotification?.(notification, true /*dont show if focused */)
      } else {
        // if not focused, set unread messages flag for the friend
        storeTypesafe.dispatch({
          type: 'friend-change',
          payload: {
            friend: {
              localPk: this.con.publicKey,
              peerPk: pk,
              hasUnreadMessages: true
            }
          }
        })
        this.onNotification?.(notification, false /*display unconditionally*/)
      }
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
          action.type == 'hydrate-user' ||
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
            this.db.removeFriend(action.payload.localPk, action.payload.peerPk)
            break
          case 'hydrate-friends':
            this.friendRoster.setFriends(action.payload)
            break
          case 'hydrate-user':
            this.publicKey = action.payload.pk
            this.con.serverUrl = action.payload.serverUrl
            this.con.enabled = action.payload.serverEnabled
            break
          case 'set-local-pk':
            this.publicKey = action.payload
            this.db.updateUser({ pk: action.payload })
            break
          case 'set-server-url':
            this.con.serverUrl = action.payload
            this.db.updateUser({ serverUrl: action.payload })
            break
          case 'set-server-enabled':
            this.con.enabled = action.payload
            this.db.updateUser({ serverEnabled: action.payload })
        }
      }
    })

    // kicks things off.
    this.db
      .getUser()
      .then((user) => storeTypesafe.dispatch({ type: 'hydrate-user', payload: user }))
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
        statusModified: Date.now(),
        hasUnreadMessages: false
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

      // modify redux store
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
        statusModified: Date.now(),
        hasUnreadMessages: false
      }
      // add to redux store
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
