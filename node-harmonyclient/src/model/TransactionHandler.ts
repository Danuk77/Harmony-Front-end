/**
 * TransactionHandler
 * Muliplexed and demultiplexes routines on a MultiplexedTransactionChannel.
 * Handles creation and deletion of transactions on this channel
 */

import { FromSchema, JSONSchema } from 'json-schema-to-ts'
import { AsyncBlockingQueue } from './AsyncBlockingQueue'
import { HarmonyTransactionSocket } from './HarmonyTransactionSocket'
import {
  HarmonyError,
  HarmonyRoutine,
  harmonyRoutineDefaultOptions,
  HarmonyRoutineOptions
} from './routine'
import { eToStr } from '../utils'
import { Validator } from 'jsonschema'

const TRANSACTION_SOCKET_TIMEOUT = 20000 //ms

export const validator = new Validator()

// export interface MultiplexedTransactionChannel {
//   send: (msg: string, routineOptions?: HarmonyRoutineOptions) => Promise<any>
//   onRecv: (fn: (msg: string) => any) => any
//   onClear: (fn: () => any) => any
// }

export class TransactionHandler<T, S> {
  private onSend: (msg: Buffer, routineOptions?: HarmonyRoutineOptions) => Promise<any>
  private transactionSockets: Map<string /*hex-encoded id*/, HarmonyTransactionSocket>
  private masterRoutine: HarmonyRoutine<T, S>
  private state: S

  constructor(
    onSend: (msg: Buffer, routineOptions?: HarmonyRoutineOptions) => Promise<any>,
    masterRoutine: HarmonyRoutine<T, S>,
    state: S
  ) {
    this.onSend = onSend
    this.transactionSockets = new Map()
    this.masterRoutine = masterRoutine
    this.state = state
  }

  /**
   *
   * @param msg an incoming message
   * @returns
   */
  public recv(msg: Buffer) {
    if (msg.byteLength < 17) {
      console.error('Malformed message: ' + msg)
      return
    }
    const id = Buffer.copyBytesFrom(msg.subarray(0, 16))
    const content = Buffer.copyBytesFrom(msg.subarray(16))

    // check if this routine belongs to an in-progress ts
    const ts = this.transactionSockets.get(id.toString('hex'))
    if (ts) {
      ts.messageCallback?.(content)
    } else {
      this.launchRoutine((state, { send, recv }) => this.masterRoutine(state, { send, recv }), {
        id: id,
        firstMsg: content
      })
    }
  }

  /**
   * Call when, eg, pipe is broken and we want to cancel all ongoing transactions
   */
  public clear() {
    // send a HarmonyError message to all open transactions.
    // this causes them to error out and (hopefully) prevent memony leaks
    for (const { messageCallback } of this.transactionSockets.values()) {
      messageCallback?.(new HarmonyError('Channel closed'))
    }
    // clear map
    this.transactionSockets = new Map()
    console.log('Channel closed')
  }

  /**
   * Launch a routine provided as an argument.
   * @param routine a callback
   * A: routine return type
   */
  public async launchRoutine<A>(
    routine: HarmonyRoutine<A, S>,
    partialRoutineOptions?: Partial<HarmonyRoutineOptions>
  ): Promise<A> {
    // add defaults
    const routineOptions = partialRoutineOptions
      ? {
          ...harmonyRoutineDefaultOptions,
          ...partialRoutineOptions
        }
      : { ...harmonyRoutineDefaultOptions }

    // generate a new id if not provided as an argument
    if (!routineOptions.id) {
      routineOptions.id = this.newTransactionSocketID()
    }

    const transactionSocket = new HarmonyTransactionSocket(routineOptions.id)
    this.transactionSockets.set(transactionSocket.id.toString('hex'), transactionSocket)

    // flag that determines if the user can still send/receive messages on this id
    let tsIsClosed = false

    // routines initiated by an incoming message have the first message passed as an option when launchRoutine is called.
    // if this is the case this flag is true.
    // it is set to false once the first message has been sent.
    let mustSendFirstMessageThatWasProvidedInTheOptions = !!routineOptions.firstMsg

    // incoming messages
    // if the websocket is closed then a HarmonyError is pushed to this queue.
    const messageQueue = new AsyncBlockingQueue<Buffer | HarmonyError>()
    transactionSocket.onReceiveMessage((msg) => {
      // if there was an error coming in, then something must be wrong.
      // set tsIsClosed to prevent sending any further messages to the server
      if (msg instanceof HarmonyError) {
        tsIsClosed = true
      }
      messageQueue.enqueue(msg)
    })

    // define callback functions recv and send

    const send = async (msg: object): Promise<void> => {
      if (tsIsClosed) {
        throw new HarmonyError('Message sent on closed transaction socket')
      }

      // client cancels.
      if (Object.prototype.hasOwnProperty.call(msg, 'terminate')) {
        tsIsClosed = true
        // enqueue HarmonyError in case there is any recv() being awaited - causes the recv to raise an error
        messageQueue.enqueue(new HarmonyError('Transaction was terminated by this client'))
      }

      // TODO
      const bufMsg = Buffer.concat([
        Buffer.from(transactionSocket.id),
        Buffer.from(JSON.stringify(msg))
      ])

      // may throw an error due to auth required, etc
      this.onSend(bufMsg, routineOptions)
    }

    /**
     * @throws HarmonyError if the server sends a `{terminate:"error"}` property
     */
    const recv = async <S extends JSONSchema, T = FromSchema<S>>(schema?: S): Promise<T> => {
      if (tsIsClosed) {
        throw new HarmonyError('recv on closed transaction socket')
      }

      let msg: Buffer
      if (mustSendFirstMessageThatWasProvidedInTheOptions) {
        /**@ts-expect-error if the above flag is set, we know that firstMsg is not undefined. */
        msg = routineOptions.firstMsg
        mustSendFirstMessageThatWasProvidedInTheOptions = false
      } else {
        // set a timeout waiting for the server response. If no response, `send()` a terminate message
        // `send()`ing the terminate message causes a HarmonyError to be pushed to the messageQueue
        // ...which is dequeued below, and thrown. This causes the routine to error out - prevent getting stuck.
        const timeout = setTimeout(() => {
          send({
            terminate: 'cancel'
          }).catch(() => {})
        }, TRANSACTION_SOCKET_TIMEOUT)

        // wait for a message/error
        const messageOrError = await messageQueue.dequeue()

        // cancel timeout when message is received
        clearTimeout(timeout)

        // if the dequeued message is a HarmonyError, throw it, preventing the recv() call getting stuck.
        if (messageOrError instanceof HarmonyError) {
          throw messageOrError
        }
        msg = messageOrError
      }

      const msgStr = Buffer.from(msg).toString('utf8')

      // parse
      // let parsed: S extends JSONSchema ? FromSchema<S> : object
      let parsed: object
      try {
        parsed = JSON.parse(msgStr)
      } catch (e) {
        throw new HarmonyError(eToStr(e))
      }

      // check if the server is terminating
      if (Object.prototype.hasOwnProperty.call(parsed, 'terminate')) {
        tsIsClosed = true

        const terminateMsg = parsed as {
          terminate: string
          error?: string
        }

        // throw any error received from the server
        if (terminateMsg.terminate == 'cancel') {
          if (Object.prototype.hasOwnProperty.call(parsed, 'error')) {
            throw new HarmonyError('Transaction cancelled by server/peer: ' + terminateMsg.error)
          } else {
            throw new HarmonyError('Transaction cancelled by server/peer')
          }
        }
      } else if (Object.prototype.hasOwnProperty.call(parsed, 'error')) {
        // non-terminating errors.
        const errorMsg = parsed as {
          error: string
        }
        console.log(errorMsg.error)

        // terminate the connection anyway. don't bother with re-sending messages for now.
        send({ terminate: 'cancel' })
        throw new HarmonyError(errorMsg.error)
      }

      // compare against schema
      if (schema) {
        const result = validator.validate(parsed, schema as object)
        if (!result.valid) {
          throw new HarmonyError(
            'An incoming message from the server/peer failed to validate with JSON schema: ' +
              result.errors.map((err) => err.toString()).join(', ')
          )
        }
      }
      // apply typings
      return parsed as T
    }

    try {
      return await routine(this.state, { recv, send })
    } catch (e) {
      throw e
    } finally {
      // cause all recv()s to error if any are still active
      while (messageQueue.isBlocked()) {
        messageQueue.enqueue(new HarmonyError('Recv on terminated transaction'))
      }
      if (!tsIsClosed) {
        // apparently the connection is still open. Attempt to close it.
        try {
          send({ terminate: 'cancel' })
        } finally {
          /**have to write a comment here for eslint reasons...*/
        }
      }
      tsIsClosed = true
      this.transactionSockets.delete(routineOptions.id.toString('hex'))
    }
  }

  private newTransactionSocketID(): Buffer {
    // return randomBytes(16)

    const charset = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let id: Buffer | undefined = undefined

    // randomly generate a key
    // In the tiny chance such an id already exists, do it again.
    while (!id || this.transactionSockets.has(id.toString('hex'))) {
      id = Buffer.from(
        new Array(16)
          .fill('')
          .map(() => charset[Math.floor(Math.random() * charset.length)])
          .join('')
      )
    }
    return id
  }
}
