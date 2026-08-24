import DataStore from '@seald-io/nedb'
import { app } from '.'
import path from 'path'
import { IceServer, KeyPair } from '../common/redux'
import { randomInt } from 'crypto'

export const DB_LOC = path.join(app.getPath('userData'), '/UserData/')
export const DB_MESSAGES_LOC = path.join(DB_LOC, '/messages.db')
export const DB_USERS_LOC = path.join(DB_LOC, '/users.db')
export const DB_FRIENDS_LOC = path.join(DB_LOC, '/friends.db')

export type User = {
  keyPair: KeyPair | null
  serverUrl: string | null
  serverEnabled: boolean
  stunServer: IceServer | null
  turnServer: IceServer | null
  // null for system default
  microphoneId: string | null
  cameraId: string | null
}
type UserDoc = User & {
  _id?: string // nedb thing
}

const defaultUser: User = {
  keyPair: null,
  serverUrl: null,
  serverEnabled: true,
  stunServer: null,
  turnServer: null,
  cameraId: null,
  microphoneId: null
}

export type Friend = {
  peerPk: string
  localPk: string
  status:
    | 'accept' // we are friends.
    | 'blocking' // they have blocked us
    | 'blocked' // we have blocked them
    | 'none' // we have unblocked them
    | 'friend-request:awaiting-our-response'
    | 'friend-request:considering-our-request'
    | 'friend-request:offline-and-our-friend-request-unsent'
    | 'friend-request:offline-and-our-friend-accept-unsent'
  // ms since UNIX epoch
  statusModified: number
  nickname: string // initially set the same as publickey
  hasUnreadMessages: boolean
}
type FriendDoc = Friend & {
  _id?: string // nedb
}

export type Message = {
  fromPk: string
  toPk: string
  text: string
  // ms since UNIX epoch
  date: number
  msgNumber: number | null
}

type MessageDoc = Message & {
  _id?: string // nedb
}

export class LocalDatabase {
  private usersDb: DataStore<UserDoc>
  private messagesDb: DataStore<MessageDoc>
  private friendsDb: DataStore<FriendDoc>

  constructor() {
    this.usersDb = new DataStore({ filename: DB_USERS_LOC, autoload: true })
    this.messagesDb = new DataStore({ filename: DB_MESSAGES_LOC, autoload: true })
    this.friendsDb = new DataStore({ filename: DB_FRIENDS_LOC, autoload: true })
  }

  public insertMessage = async (msg: Message) => {
    await this.messagesDb.insertAsync(msg)
  }

  public getConversation = async (pk0: string, pk1: string) => {
    const messages = await this.messagesDb
      .findAsync({
        $or: [
          {
            fromPk: pk0,
            toPk: pk1
          },
          {
            fromPk: pk1,
            toPk: pk0
          }
        ]
      })
      .sort({ date: 1, msgNumber: 1 })
    return messages
  }

  public hasMessage = async (fromPk: string, toPk: string, msgNumber: number) => {
    return !!(await this.messagesDb.findOneAsync({
      fromPk,
      toPk,
      msgNumber
    }))
  }

  public getNewMessageNumber = async (fromPk: string, toPk: string) => {
    let msgNumber: number

    while (true) {
      msgNumber = randomInt(0, 281474976710654)

      // check if number is already in db (very rare)
      const inDb = !!(await this.messagesDb.findOneAsync({
        fromPk,
        toPk,
        msgNumber
      }))

      if (!inDb) {
        break
      }
    }
    return msgNumber
  }

  public getFriend = async (localPk: string, peerPk: string) => {
    const friend = await this.friendsDb.findOneAsync({
      localPk: localPk,
      peerPk: peerPk
    })
    // might be null, according to the docs.
    if (friend) {
      return friend as FriendDoc
    } else {
      return null
    }
  }

  public getAllFriends = async (localPk: string) => {
    return await this.friendsDb.findAsync({
      localPk
    })
  }

  /**
   * Modifies fields of a friend.
   * @param fields
   * @returns True if a friend was updated.
   */
  public updateFriend = async (fields: Pick<Friend, 'peerPk' | 'localPk'> & Partial<Friend>) => {
    const { peerPk, localPk, ...fieldsToModify } = fields

    const result = await this.friendsDb.updateAsync(
      {
        localPk: localPk,
        peerPk: peerPk
      },
      { $set: fieldsToModify }
    )
    return result.numAffected >= 1
  }

  /**
   * Deletes a friend from the database
   * @param localPk
   * @param peerPk
   * @returns True if a friend was deleted
   */
  public removeFriend = async (localPk: string, peerPk: string) => {
    const result = await this.friendsDb.removeAsync({ localPk, peerPk }, {})
    return result >= 1
  }

  /**
   * Add a new friend to the database.
   * @param friend
   */
  public insertFriend = async (friend: Friend) => {
    await this.friendsDb.insertAsync(friend)
  }

  public updateUser = async (fields: Partial<User>) => {
    const result = await this.usersDb.updateAsync({}, { $set: fields })
    if (result.numAffected == 0) {
      // create doc
      const newDoc: User = {
        ...defaultUser,
        ...fields
      }
      await this.usersDb.insertAsync(newDoc)
    } else if (result.numAffected > 1) {
      throw new Error(
        'Multiple user documents in ' +
          DB_USERS_LOC +
          '\nDelete the file or remove all but 1 entry from within'
      )
    }
  }

  public getUser = async (): Promise<User> => {
    try {
      const user = await this.usersDb.findOneAsync({})
      if (!user) return defaultUser
      return { ...defaultUser /**add extra fields if missing */, ...user }
    } catch {
      return defaultUser
    }
  }
}
