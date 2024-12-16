import DataStore from '@seald-io/nedb'
import { app } from '.'
import path from 'path'

export const DB_LOC = path.join(app.getPath('userData'), '/UserData/')
export const DB_MESSAGES_LOC = path.join(DB_LOC, '/messages.db')
export const DB_USERS_LOC = path.join(DB_LOC, '/users.db')
export const DB_FRIENDS_LOC = path.join(DB_LOC, '/friends.db')

export type User = {
  pk: string
}
type UserDoc = User & {
  _id?: string // nedb thing
}

export type Friend = {
  friendPk: string
  localPk: string
  status: 'reject' | 'accept' | 'pending' | 'block'
  statusModified: Date
  nickname: string // initially sent the same as publickey
}
type FriendDoc = Friend & {
  _id?: string // nedb
}

export type Message = {
  fromPk: string
  toPk: string
  text: string
  date: Date
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

  public getFriend = async (localPk: string, friendPk: string) => {
    const friend = await this.friendsDb.findOneAsync({
      localPk: localPk,
      friendPk: friendPk
    })
    // might be null, according to the docs.
    if (friend) {
      return friend as FriendDoc
    } else {
      return null
    }
  }

  public getAllFriends = async () => {
    return await this.friendsDb.findAsync({})
  }

  /**
   * Modifies fields of a friend.
   * @param fields
   * @returns True if a friend was updated.
   */
  public updateFriend = async (fields: Pick<Friend, 'friendPk' | 'localPk'> & Partial<Friend>) => {
    const { friendPk, localPk, ...fieldsToModify } = fields

    const result = await this.friendsDb.updateAsync(
      {
        localPk: localPk,
        friendPk: friendPk
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
}
