import { HarmonyConnection } from './connection/HarmonyConnection'
import { FriendRoster } from './FriendRoster'
import { Friend, LocalDatabase, Message } from './LocalDatabase'

const DEBUG = true

// links database and connections.
export class State {
  private friendRoster: FriendRoster
  private con: HarmonyConnection
  private db: LocalDatabase
  private publicKey: string

  constructor(publicKey: string) {
    this.publicKey = publicKey
    this.db = new LocalDatabase()
    this.con = new HarmonyConnection(publicKey)
    this.friendRoster = new FriendRoster(this.con)

    // con listeners
    this.con.onFailedLogin = undefined // notify the user
    this.con.onIncomingConnectionRequest = async (pk) => {
      const friend = await this.db.getFriend(this.publicKey, pk)
      if (friend && friend.status == 'accept') {
        return 'accept'
      } else {
        return 'reject'
      }
    }
    this.con.onIncomingConnectionResult = (result) => {
      this.friendRoster.receiveConnection(result)
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
          friendPk: pk,
          ...updatedFields
        })
        updatedFriend = { ...friend, ...updatedFields }
      } else {
        updatedFriend = {
          localPk: this.publicKey,
          friendPk: pk,
          status: 'reject',
          statusModified: new Date(Date.now()),
          nickname: pk
        }
        await this.db.insertFriend(updatedFriend)
      }

      // tell the friend roster
      this.friendRoster.addOrUpdateFriend(updatedFriend)

      /**@todo tell the front end */
    }
    this.con.onReceiveFriendRequest = async (pk) => {
      const friend = await this.db.getFriend(this.publicKey, pk)
      if (friend) {
        switch (friend.status) {
          case 'reject':
            {
              const update = {
                localPk: this.publicKey,
                friendPk: pk,
                status: 'pending' as const,
                statusModified: new Date(Date.now())
              }
              await this.db.updateFriend(update)
              this.friendRoster.updateFriend(update)
              /** @todo status has changed - inform the front end */
              /**@todo send notification */
            }
            return 'pending'
          case 'accept':
            return 'accept'
          case 'pending':
            return 'pending'
          case 'block':
            return 'reject'
        }
      } else {
        // insert a new friend obj
        const newFriend: Friend = {
          localPk: this.publicKey,
          friendPk: pk,
          status: 'pending',
          nickname: pk,
          statusModified: new Date(Date.now())
        }
        await this.db.insertFriend(newFriend)
        this.friendRoster.addOrUpdateFriend(newFriend)
        /**@todo send notification */
        /** @todo inform the front end */
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
      /**@todo send a message to the renderer... */
      if (status == 'connected') {
        this.friendRoster.paused = false
      } else {
        // start connecting to friends
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
      /**@todo send a message to the renderer */
      /**@todo send notification */
    }

    /**@todo send a message to the renderer */
    this.friendRoster.onFriendConnectionStatusChange = undefined

    // start websocket connection initiation
    this.con.reconnect()

    // on startup, add all friends to the friend roseter.
    this.db.getAllFriends().then((friends) => {
      for (const friend of friends) {
        this.friendRoster.addOrUpdateFriend(friend)
      }
    })
  }
}
