import DataStore from '@seald-io/nedb'
import { app } from '.'
import path from 'path'

export const DB_LOC = path.join(app.getPath('userData'), '/UserData/')
export const DB_MESSAGES_LOC = path.join(DB_LOC, '/messages.db')
export const DB_USERS_LOC = path.join(DB_LOC, '/users.db')
export const DB_FRIENDS_LOC = path.join(DB_LOC, '/friends.db')

console.log(DB_LOC)

export type User = {
  pk: string | null
  serverUrl: string | null
  serverEnabled: boolean
}
type UserDoc = User & {
  _id?: string // nedb thing
}

const defaultUser: User = {
  pk: null,
  serverUrl: null,
  serverEnabled: true
}

export type Friend = {
  peerPk: string
  localPk: string
  status:
    | 'reject' // they rejected us.
    | 'accept' // they are friends with us.
    | 'pending' // they are waiting for us to reply.
    | 'block' // we rejected them
    | 'awaiting-response' // we want to become friends; waiting for peer's response
  // ms since UNIX epoch
  statusModified: number
  nickname: string // initially set the same as publickey
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
    const friends = await this.messagesDb
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
      .sort({ date: 1 })
    return friends
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
      return await this.usersDb.findOneAsync({})
    } catch {
      return defaultUser
    }
  }
}
