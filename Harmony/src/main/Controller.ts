/**
 * Links the database, con, and friend roster.
 * @todo: make resendFriendRequestTimers be controlled ONLY by redux middleware
 */

import { DEBUG } from '.'
import { Action, KeyPair } from '../common/redux'
import { FriendWithState, MainToRenderer1WayAction } from '../preload'
import { HarmonyConnection, WebsocketStatusType, FriendRequestResult } from 'node-harmonyclient'
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

const resendFriendRequestTimeout = 300_000 // ms

// links database and connections.
export class Controller {
  public friendRoster: FriendRoster
  private con: HarmonyConnection
  public db: LocalDatabase
  private _keyPair: KeyPair | null = null

  private friendRequestTimers = new Map<string, NodeJS.Timeout>()

  // callback for IPCs to be sent to the renderer.
  public onMainToRenderer1WayAction?: (arg0: MainToRenderer1WayAction) => unknown
  // callback for system notifications
  public onNotification?: (
    notification: Electron.NotificationConstructorOptions,
    dontShowIfFocused: boolean,
    onclick?: () => unknown
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
      if (reason != store.getState().connection.failedLoginMsg) {
        storeTypesafe.dispatch({ type: 'set-failed-login-msg', payload: reason })
      }
    }

    this.con.onFailedConnect = (reason) => {
      if (reason != store.getState().connection.failedConnectMsg) {
        storeTypesafe.dispatch({ type: 'set-failed-connect-msg', payload: reason })
      }
    }

    this.con.onIncomingConnectionRequest = async (pk) => {
      if (!this.keyPair) return 'reject'

      const friend = getFriendState(this.keyPair.publicKey, pk)?.friend

      if (friend && friend.status == 'accept') {
        return 'accept'
        /**@todo maybe inform the renderer?*/
      } else if (friend && friend.status == 'blocked') {
        // if we have blocked them, send an explicit friend rejection message
        // after a short delay to reduce likelihood of race condition in peer client of the friend status of this client
        ;((localPk) => setTimeout(() => this.sendFriendRejection(localPk.publicKey, pk), 1000))(
          this.keyPair
        )

        return 'reject'
      } else if (friend && this.friendRequestTimers.has(pk)) {
        // we are not friends, but we are scheduled to send them a friend request.
        // bring that forward to now.
        // They will probably accept it, given that they are trying to connect to us.
        this.sendFriendRequest(this.keyPair.publicKey, pk, friend.nickname)
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
      if (!this.keyPair) return

      const friend = getFriendState(this.keyPair.publicKey, pk)?.friend
      let updatedFriend: Friend

      // update the friend
      if (friend) {
        const updatedFields: Partial<Friend> = {
          status: 'blocking' as const,
          statusModified: Date.now()
        }
        updatedFriend = { ...friend, ...updatedFields }

        // update the state
        storeTypesafe.dispatch({ type: 'friend-change', payload: { friend: updatedFriend } })
      } else {
        updatedFriend = {
          localPk: this.keyPair.publicKey,
          peerPk: pk,
          status: 'blocking',
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
      // this shouldn't happen - just for type narrowing
      if (!this.keyPair) {
        return 'reject'
      }

      const friend = getFriendState(this.keyPair.publicKey, pk)?.friend
      if (friend) {
        switch (friend.status) {
          case 'accept':
            return 'accept'
          case 'none':
          case 'blocking':
            {
              // if they had previously blocked us, treat it like a new "clean" request
              const update = {
                localPk: this.keyPair.publicKey,
                peerPk: pk,
                status: 'friend-request:awaiting-our-response' as const,
                statusModified: Date.now()
              }

              storeTypesafe.dispatch({
                type: 'friend-change',
                payload: { friend: update }
              })

              this.onNotification?.(
                { title: 'Received friend request', body: friend.nickname + ' (' + pk + ')' },
                true,
                () => {
                  storeTypesafe.dispatch({ type: 'setSelectedFriendPk', payload: { pk } })
                  storeTypesafe.dispatch({ type: 'set-screen-mode', payload: 'edit-friend' })
                }
              )
            }
            return 'pending'
          case 'blocked':
            // if we have blocked them, send an explicit friend rejection message
            // after a short delay to reduce likelihood of race condition in peer client of the friend status of this client
            ;((localPk) => setTimeout(() => this.sendFriendRejection(localPk.publicKey, pk), 1000))(
              this.keyPair
            )
            return 'reject'
          case 'friend-request:awaiting-our-response':
            return 'pending'
          case 'friend-request:considering-our-request':
          case 'friend-request:offline-and-our-friend-accept-unsent':
          case 'friend-request:offline-and-our-friend-request-unsent':
            // accept
            {
              const update = {
                localPk: this.keyPair.publicKey,
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
          localPk: this.keyPair.publicKey,
          peerPk: pk,
          status: 'friend-request:awaiting-our-response',
          nickname: pk,
          statusModified: Date.now(),
          hasUnreadMessages: false
        }

        // tell the renderer
        storeTypesafe.dispatch({
          type: 'add-friend',
          payload: newFriend
        })

        this.onNotification?.({ title: 'Received friend request', body: pk }, true, () => {
          storeTypesafe.dispatch({ type: 'setSelectedFriendPk', payload: { pk } })
          storeTypesafe.dispatch({ type: 'set-screen-mode', payload: 'edit-friend' })
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
        // immmediately resend any friend requests
        if (this.keyPair /*Definitely set if we're logged in. For type narrowing */) {
          for (const pk of Array.from(this.friendRequestTimers.keys())) {
            this.sendFriendRequest(this.keyPair?.publicKey, pk)
          }
        }
      } else {
        this.friendRoster.paused = true
      }
    }

    // friend roster listeners
    this.friendRoster.onReceiveMessage = async (pk, msg, msgNumber) => {
      if (
        msgNumber &&
        (msgNumber < 0 || msgNumber > Number.MAX_SAFE_INTEGER || !Number.isInteger(msgNumber))
      ) {
        return { status: 'reject', reason: 'Bad msgNumber' }
      }

      if (msgNumber && (await this.db.hasMessage(pk, 'local', msgNumber))) {
        return { status: 'reject', reason: 'Message has already been received' }
      }

      const msgObj: Message = {
        date: Date.now(),
        fromPk: pk,
        toPk: 'local',
        text: msg,
        msgNumber: msgNumber
      }

      // write message to database
      this.db.insertMessage(msgObj)

      // update renderer
      this.onMainToRenderer1WayAction?.({
        type: 'receive-message',
        payload: msgObj
      })

      const state = store.getState()

      const notification: Electron.NotificationConstructorOptions = {
        title:
          // friend nickname
          state.user.keyPair
            ? (getFriendState(state.user.keyPair.publicKey, pk)?.friend.nickname ?? '')
            : '',
        body: msg
      }

      const onClickNotification = () => {
        storeTypesafe.dispatch({ type: 'setSelectedFriendPk', payload: { pk } })
        storeTypesafe.dispatch({ type: 'set-screen-mode', payload: 'chat' })
        if (!this.keyPair) return
        // remove unread message marker from friend
        storeTypesafe.dispatch({
          type: 'friend-change',
          payload: {
            friend: { localPk: this.keyPair.publicKey, peerPk: pk, hasUnreadMessages: false }
          }
        })
      }

      if (!this.con.keyPair) {
        // type narrowing
        throw new Error()
      }

      // notification and unread! flag
      if (state.ui.screenMode == 'chat' && state.ui.selectedFriendPk == pk) {
        this.onNotification?.(notification, true /*dont show if focused */, onClickNotification)
      } else {
        // if not focused, set unread messages flag for the friend
        if (!getFriendState(this.con.keyPair.publicKey, pk)?.friend.hasUnreadMessages) {
          storeTypesafe.dispatch({
            type: 'friend-change',
            payload: {
              friend: {
                localPk: this.con.keyPair.publicKey,
                peerPk: pk,
                hasUnreadMessages: true
              }
            }
          })
        }
        this.onNotification?.(notification, false /*display unconditionally*/, onClickNotification)
      }

      return { status: 'accept' }
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

    this.friendRoster.onVideoCallStatusChange = (peerPk, status) => {
      storeTypesafe.dispatch({
        type: 'friend-video-call-status-change',
        payload: {
          friend: {
            peerPk: peerPk
          },
          callStatus: status
        }
      })
    }

    this.friendRoster.onPeerSdpAnswerForVideoCall = (peerPk, answerSdp, callID) => {
      this.onMainToRenderer1WayAction?.({
        type: 'peerSdpAnswerForVideoCall',
        payload: {
          peerPk,
          sdp: answerSdp,
          callID
        }
      })
    }

    this.friendRoster.onPeerIceCandidateForVideoCall = (peerPk, candidate, callID) => {
      this.onMainToRenderer1WayAction?.({
        type: 'peerIceCandidateForVideoCall',
        payload: {
          peerPk,
          candidate,
          callID
        }
      })
    }

    //update friend roster and database when redux store changes
    // redux store is considered the main source of truth
    // middleware propegates updates
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
          action.type == 'set-key-pair' ||
          action.type == 'set-server-url' ||
          action.type == 'set-server-enabled' ||
          action.type == 'set-stun-server' ||
          action.type == 'set-turn-server'
        )
      },
      effect: (_action) => {
        const action = _action as Action // typescript is dumb
        switch (action.type) {
          case 'add-friend':
            this.friendRoster.addOrUpdateFriend(action.payload)
            this.db.insertFriend(action.payload)
            this.updateFriendRequestSchedule(action.payload, false)
            break
          case 'friend-change':
            this.friendRoster.updateFriend(action.payload.friend)
            this.db.updateFriend(action.payload.friend)
            action.payload.friend.status &&
              this.updateFriendRequestSchedule(
                {
                  // do this instead of just passing action.payload.friend because typescript doesn't notice that .status is definitely defined here
                  status: action.payload.friend.status,
                  ...action.payload.friend
                },
                false /*don't send request immediately */
              )
            break
          case 'remove-friend':
            this.friendRoster.removeFriend(action.payload.peerPk)
            this.db.removeFriend(action.payload.localPk, action.payload.peerPk)
            // stop sending friend requests
            this.clearFriendRequestTimer(action.payload.peerPk)
            break
          case 'hydrate-friends':
            this.friendRoster.setFriends(action.payload)
            // reset friend requests
            this.clearFriendRequestTimers()
            action.payload.forEach((friend) => this.updateFriendRequestSchedule(friend))
            break
          case 'hydrate-user':
            this.keyPair = action.payload.keyPair
            this.con.serverUrl = action.payload.serverUrl
            this.con.options.stunServer = action.payload.stunServer
            this.con.options.turnServer = action.payload.turnServer
            this.con.enabled = action.payload.serverEnabled
            break
          case 'set-key-pair':
            this.keyPair = action.payload // propagates in setter. Causes a hydrate-friends action
            this.db.updateUser({ keyPair: action.payload })
            break
          case 'set-server-url':
            this.con.serverUrl = action.payload
            this.db.updateUser({ serverUrl: action.payload })
            break
          case 'set-server-enabled':
            this.con.enabled = action.payload
            this.db.updateUser({ serverEnabled: action.payload })
            break
          case 'set-stun-server':
            this.con.options.stunServer = action.payload
            this.db.updateUser({ stunServer: action.payload })
            break
          case 'set-turn-server':
            this.con.options.turnServer = action.payload
            this.db.updateUser({ turnServer: action.payload })
            break
        }
      }
    })

    // kicks things off.
    this.db
      .getUser()
      .then((user) => storeTypesafe.dispatch({ type: 'hydrate-user', payload: user }))
  }

  // start or stop sending friend requests based on the friend status.
  private updateFriendRequestSchedule = (
    friend: Partial<Friend> & Pick<Friend, 'peerPk' | 'status'>,
    immediate: boolean = true
  ) => {
    this.clearFriendRequestTimer(friend.peerPk)
    if (
      friend.status == 'friend-request:offline-and-our-friend-accept-unsent' ||
      friend.status == 'friend-request:offline-and-our-friend-request-unsent'
    ) {
      this.resetFriendRequestTimer(friend.peerPk)
      if (immediate) {
        this.keyPair && immediate && this.sendFriendRequest(this.keyPair.publicKey, friend.peerPk)
      }
    }
  }

  /**
   * Send a message to a peer, update the database, return a message to the front end.
   */
  public sendMessage = async (toPk: string, message: string): Promise<SendMessageReturnType> => {
    const msgNumber = await this.db.getNewMessageNumber('local', toPk)

    // send message
    try {
      await this.friendRoster.sendMessage(toPk, message, msgNumber)
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
      text: message,
      msgNumber
    }

    // insert into database.
    try {
      await this.db.insertMessage(msgObj)
    } catch (e) {
      console.error(eToStr(e))
      return {
        msg: msgObj,
        error: 'Failed to add message to local database: ' + eToStr(e)
      }
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
    nickname?: string
  ): Promise<FriendRequestResult> => {
    // reset interval
    if (this.friendRequestTimers.has(peerPk)) this.resetFriendRequestTimer(peerPk)

    if (this.con.wsStatus != 'logged-in') {
      return {
        status: 'fail',
        msg: 'You are not logged in'
      }
    }

    if (!this.keyPair || localPk != this.keyPair.publicKey) {
      return {
        status: 'fail',
        msg: 'Local public key has changed'
      }
    }

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

    // work out whether message is a request or a response (the server protocol does not distinguish, but the client does.)
    let requestType: 'request' | 'response'
    let friendObj = getFriendState(localPk, peerPk)?.friend
    if (!friendObj) {
      requestType = 'request'
    } else {
      // check if we have received a request
      if (
        friendObj.status == 'friend-request:awaiting-our-response' ||
        friendObj.status == 'friend-request:offline-and-our-friend-accept-unsent'
      ) {
        requestType = 'response'
      } else {
        requestType = 'request'
      }
    }

    // new friend status depends on response from peer, and what the curret status is.
    let newStatus: Friend['status'] | undefined = undefined
    if (result.status == 'offline') {
      switch (requestType) {
        case 'request':
          newStatus = 'friend-request:offline-and-our-friend-request-unsent'
          break
        case 'response':
          newStatus = 'friend-request:offline-and-our-friend-accept-unsent'
          break
      }
    } else {
      switch (result.type) {
        case 'accept':
          newStatus = 'accept'
          break
        case 'reject':
          newStatus = 'none'
          break
        case 'pending':
          newStatus = 'friend-request:considering-our-request'
          break
      }
    }

    // update db and friend roster
    const friendUpdate = {
      peerPk,
      localPk,
      status: newStatus,
      statusModified: Date.now(),
      ...(nickname && { nickname })
    }
    if (friendObj) {
      // tell the front end
      storeTypesafe.dispatch({
        type: 'friend-change',
        payload: { friend: friendUpdate }
      })
    } else {
      // new friend obj
      friendObj = {
        nickname: peerPk,
        ...friendUpdate, // may overwrite nickname
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
    const friendUpdate = {
      localPk: localPk,
      peerPk: peerPk,
      status: 'blocked' as const,
      statusModified: Date.now()
    }
    if (friendObj) {
      // modify redux store
      storeTypesafe.dispatch({
        type: 'friend-change',
        payload: { friend: friendUpdate }
      })
    } else {
      const friend: Friend = {
        ...friendUpdate,
        nickname: peerPk,
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

  public unblockFriend = async (localPk: string, peerPk: string) => {
    const friendObj = getFriendState(localPk, peerPk)?.friend
    if (!friendObj) return

    storeTypesafe.dispatch({
      type: 'friend-change',
      payload: {
        friend: {
          localPk,
          peerPk,
          status: 'none',
          statusModified: Date.now()
        }
      }
    })
  }

  public withdrawFriendRequest = async (localPk: string, peerPk: string) => {
    // update
    const friendObj = getFriendState(localPk, peerPk)?.friend
    if (!friendObj) return
    storeTypesafe.dispatch({
      type: 'friend-change',
      payload: {
        friend: {
          localPk,
          peerPk,
          status: 'none'
        }
      }
    })
  }

  public withdrawFriendAccept = async (localPk: string, peerPk: string) => {
    // update
    const friendObj = getFriendState(localPk, peerPk)?.friend
    if (!friendObj) return
    storeTypesafe.dispatch({
      type: 'friend-change',
      payload: {
        friend: {
          localPk,
          peerPk,
          status: 'friend-request:awaiting-our-response'
        }
      }
    })
  }

  public set keyPair(keyPair: KeyPair | null) {
    // remove all friend request resends
    this.clearFriendRequestTimers()

    this._keyPair = keyPair
    this.con.keyPair = keyPair

    if (keyPair) {
      // update friend roster with correct friends
      this.db.getAllFriends(keyPair.publicKey).then((friends) => {
        storeTypesafe.dispatch({ type: 'hydrate-friends', payload: friends })
      })
    } else {
      // clear friends
      storeTypesafe.dispatch({ type: 'hydrate-friends', payload: [] })
    }
  }

  public get keyPair() {
    return this._keyPair
  }

  private clearFriendRequestTimer = (peerPk: string) => {
    clearInterval(this.friendRequestTimers.get(peerPk))
    this.friendRequestTimers.delete(peerPk)
  }

  private clearFriendRequestTimers = () => {
    for (const pk of this.friendRequestTimers.keys()) {
      this.clearFriendRequestTimer(pk)
    }
  }

  private resetFriendRequestTimer = (peerPk: string) => {
    this.clearFriendRequestTimer(peerPk)
    const interval = setInterval(
      () => this.keyPair && this.sendFriendRequest(this.keyPair.publicKey, peerPk),
      resendFriendRequestTimeout
    )
    this.friendRequestTimers.set(peerPk, interval)
  }

  /**
   * Gracefully stop everything
   */
  public close() {
    // remove all friend request resends
    this.clearFriendRequestTimers()
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
