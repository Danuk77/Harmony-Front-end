import { HarmonyRoutineParams } from 'node-harmonyclient'
import { mainToRendererComManager } from '../MainToRendererComManager'
import { eToStr } from '../Controller'
import { FriendConnectionHandler } from '../FriendConnectionHandler'
import { assertNever } from '../../common/utils'

const waiterInterval = 5000 //ms
const maxWaits = 12

/*
  Signalling states of peers A and B.
  A is the initiator

        A      msg    B
     outgoing  ->                     A rings B
        |      <>   incoming
        |      <>     |               both send {"type":"wait"} messages while waiting for B's user to accept or reject the call...
        |      <>     |
        |      <-   expectSDPAnswer   B accepts, sends SDP offer. May also send ICE candidates in this phase.
       ICE     ->     |               A sends SDP answer
        |      <>   ICE               Both send ICE candidates
        |      <>     |
        |      <>     |
 */

export type ICECandidate = {
  candidate: string
  sdpMLineIndex: number
  sdpMid?: string
  usernameFragment?: string
}

const outgoingRecvTemplate = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  anyOf: [
    {
      properties: {
        type: { const: 'reject' },
        terminate: { const: 'done' }
      },
      required: ['type', 'terminate'],
      additionalProperties: false
    },
    {
      properties: {
        type: { const: 'wait' }
      },
      required: ['type'],
      additionalProperties: false
    },
    {
      properties: {
        type: { const: 'acceptAndOffer' },
        payload: {
          type: 'object',
          properties: {
            type: { const: 'offer' },
            sdp: { type: 'string' }
          },
          required: ['type', 'sdp'],
          additionalProperties: false
        }
      },
      required: ['type', 'payload'],
      additionalProperties: false
    }
  ]
} as const

const incomingRecvTemplate = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  anyOf: [
    {
      properties: {
        type: { const: 'reject' },
        terminate: { const: 'done' }
      },
      required: ['type', 'terminate'],
      additionalProperties: false
    },
    {
      properties: {
        type: { const: 'wait' }
      },
      required: ['type'],
      additionalProperties: false
    },
    {
      properties: {
        type: { const: 'answer' },
        payload: {
          type: 'object',
          properties: {
            type: { const: 'answer' },
            sdp: { type: 'string' }
          },
          required: ['type', 'sdp'],
          additionalProperties: false
        }
      },
      required: ['type', 'payload'],
      additionalProperties: false
    }
  ]
} as const

// const expectSDPAnswerRecvTemplate = {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   type: 'object',
//   properties: {
//     type: { const: 'answer' },
//     payload: {
//       type: 'object',
//       properties: {
//         type: { const: 'answer' },
//         sdp: { type: 'string' }
//       },
//       required: ['type', 'sdp'],
//       additionalProperties: false
//     }
//   },
//   required: ['type', 'payload'],
//   additionalProperties: false
// } as const

const iceRecvTemplate = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  anyOf: [
    {
      properties: {
        type: {
          const: 'ICECandidate'
        },
        payload: {
          type: 'object',
          properties: {
            candidate: {
              type: 'string'
            },
            sdpMLineIndex: {
              type: 'integer'
            },
            sdpMid: {
              type: 'string'
            },
            usernameFragment: {
              type: 'string'
            }
          },
          required: ['candidate', 'sdpMLineIndex'],
          additionalProperties: false
        } as const
      },
      required: ['type', 'payload'],
      additionalProperties: false
    },
    {
      properties: {
        type: { const: 'reject' },
        terminate: { const: 'done' }
      },
      required: ['type', 'terminate'],
      additionalProperties: false
    }
  ]
} as const

export class VideoCallRoutine {
  private friendPk: string
  private fch: FriendConnectionHandler
  public currentSignalling?: {
    state: 'outgoing' | 'incoming' | 'expectSDPAnswer' | 'ICE'
    waitCounter: number
    waitInverval: NodeJS.Timeout | null
    send: HarmonyRoutineParams['send']
    recv: HarmonyRoutineParams['recv']
    resolve: Parameters<ConstructorParameters<typeof Promise<void>>[0]>[0]
    reject: Parameters<ConstructorParameters<typeof Promise<void>>[0]>[1]
    peerOfferSdp: { sdp: string; type: 'offer' } | null
    id: number
  }

  constructor(friendPk: string, fch: typeof this.fch) {
    this.friendPk = friendPk
    this.fch = fch
  }

  public setCurrentSignalling(
    // set current without needing to provide all the internal properties
    args: Pick<
      NonNullable<typeof this.currentSignalling>,
      'send' | 'recv' | 'resolve' | 'reject' | 'state' | 'id'
    >
  ) {
    this.currentSignalling = {
      waitCounter: 0,
      waitInverval: null,
      peerOfferSdp: null,
      ...args
    }
  }

  public async startRecvLoop() {
    if (!this.currentSignalling) {
      console.warn('Failed to start video call recv interval - no routine')
    }

    try {
      while (this.currentSignalling) {
        switch (this.currentSignalling.state) {
          case 'outgoing': {
            // received response to call
            const msg = await this.currentSignalling.recv(outgoingRecvTemplate)
            switch (msg.type) {
              case 'reject': {
                this.fch.videoCallManager.peerHangsUp(this.currentSignalling.id)
                return
              }
              case 'wait': {
                break
              }
              case 'acceptAndOffer': {
                this.currentSignalling.peerOfferSdp = msg.payload
                // next message we receive should be ice candidates
                this.currentSignalling.state = 'ICE'
                this.fch.videoCallManager.peerAccepts()
                break
              }
              default:
                assertNever(msg)
            }
            break
          }

          case 'incoming':
          case 'expectSDPAnswer': {
            const msg = await this.currentSignalling.recv(incomingRecvTemplate)
            switch (msg.type) {
              case 'reject': {
                this.fch.videoCallManager.peerHangsUp(this.currentSignalling.id)
                return
              }
              case 'wait': {
                break
              }
              case 'answer': {
                if (this.currentSignalling.state == 'expectSDPAnswer') {
                  this.fch.onPeerSdpAnswerForVideoCall(msg.payload, this.currentSignalling.id)
                  this.currentSignalling.state = 'ICE'
                } else {
                  this.cancelCurrentRoutine('Not expecting an sdp answer yet')
                  throw new Error('Peer sent an unexpected sdp answer')
                }
                break
              }
              default:
                assertNever(msg)
            }
            break
          }

          case 'ICE': {
            const msg = await this.currentSignalling.recv(iceRecvTemplate)
            switch (msg.type) {
              case 'ICECandidate': {
                this.fch.onPeerIceCandidateForVideoCall(msg.payload, this.currentSignalling.id)
                break
              }
              case 'reject': {
                this.fch.videoCallManager.peerHangsUp(this.currentSignalling.id)
                return
              }
              default:
                assertNever(msg)
            }
            break
          }

          default:
            assertNever(this.currentSignalling.state)
        }
      }
    } catch (e) {
      let eStr = eToStr(e)
      if (eStr == '') {
        eStr = 'Unknown error'
      }
      // console.error('Error while setting up the video call: ' + eStr)
      /**@todo do something about videoCallManager.error being called multiple times for the same transaction */
      if (this.currentSignalling) {
        this.fch.videoCallManager.error('routine', eStr, this.currentSignalling.id)
      }
    } finally {
      this.terminateCurrentRoutine()
    }
  }

  public startWaitLoop() {
    // waiting for the receiver to pick up/reject.
    // both peers must send a {"type": "wait"} message periodicly to prevent transaction timing out
    // has a max number of wait messages it can send before cancelling the transaction
    if (this.currentSignalling?.waitInverval) {
      clearInterval(this.currentSignalling.waitInverval)
    }
    if (!this.currentSignalling) {
      console.error('Failed to start video call wait interval - no routine')
      return
    }

    // keep trying to send {"type": "wait"} while state is appropriate
    const interval = setInterval(async () => {
      if (
        !this.currentSignalling ||
        !(this.currentSignalling.state == 'incoming' || this.currentSignalling.state == 'outgoing')
      ) {
        // no longer in a ringing state - stop sending waits
        clearInterval(interval)
        return
      }
      if (this.currentSignalling.waitCounter++ >= maxWaits) {
        // timeout
        this.cancelCurrentRoutine()
        return
      }
      try {
        await this.currentSignalling.send({ type: 'wait' })
      } catch {
        this.killCurrentRoutine()
      }
    }, waiterInterval)
    this.currentSignalling.waitInverval = interval
  }

  public async acceptIncomingCallWithWindowOpen(id: number) {
    if (!this.currentSignalling || id != this.currentSignalling.id) {
      return
    }

    if (!this.currentSignalling || this.currentSignalling.state != 'incoming') {
      throw Error('No incoming call to accept')
    }

    // update state
    this.currentSignalling.state = 'expectSDPAnswer'
    if (this.currentSignalling.waitInverval) clearInterval(this.currentSignalling.waitInverval)

    let typeAndSdp: { type: 'offer'; sdp: string }
    try {
      typeAndSdp = await mainToRendererComManager.genSdpOfferForVideoCall(this.friendPk, id)
    } catch (e) {
      throw Error(eToStr(e))
    }

    try {
      await this.currentSignalling.send({
        type: 'acceptAndOffer',
        payload: typeAndSdp
      })
    } catch {
      this.killCurrentRoutine()
      throw Error('Error sending sdp offer')
    }
  }

  // invoked by renderer
  public async rejectCall() {
    if (
      !this.currentSignalling ||
      !(this.currentSignalling.state == 'incoming' || this.currentSignalling.state == 'outgoing')
    ) {
      throw Error('No call to reject')
    }
    try {
      await this.currentSignalling.send({
        type: 'reject',
        terminate: 'done'
      })
    } catch {}
    this.terminateCurrentRoutine()
  }

  public async forwardSdpAnswerToPeer(answer: { type: 'answer'; sdp: string }) {
    if (!this.currentSignalling || this.currentSignalling.state != 'ICE') {
      throw Error('Not ready to forward sdp answer to to peer')
    }
    try {
      await this.currentSignalling.send({
        type: 'answer',
        payload: answer
      })
    } catch {
      this.killCurrentRoutine()
      throw Error('Error sending sdp answer candidate')
    }
  }

  // invoked by renderer
  public async forwardICECandidateForVideoCall(candidate: ICECandidate) {
    if (
      !this.currentSignalling ||
      !(this.currentSignalling.state == 'ICE' || this.currentSignalling.state == 'expectSDPAnswer')
    ) {
      throw Error('Not ready to forward ICE candidates to peer')
    }

    try {
      await this.currentSignalling.send({
        type: 'ICECandidate',
        payload: candidate
      })
    } catch {
      this.killCurrentRoutine()
      throw Error('Error sending ICE candidate')
    }
  }

  public killCurrentRoutine() {
    // make routine error
    if (this.currentSignalling) {
      this.currentSignalling.reject()
      if (this.currentSignalling.waitInverval) clearInterval(this.currentSignalling.waitInverval)
      this.currentSignalling = undefined
    }
  }

  public async cancelCurrentRoutine(error?: string) {
    // send terminate: cancel
    if (this.currentSignalling) {
      try {
        await this.currentSignalling.send({ terminate: 'cancel', ...(error ? { error } : {}) })
      } finally {
        this.terminateCurrentRoutine()
      }
    }
  }

  public terminateCurrentRoutine() {
    if (this.currentSignalling) {
      this.currentSignalling.resolve()
      if (this.currentSignalling.waitInverval) clearInterval(this.currentSignalling.waitInverval)
      this.currentSignalling = undefined
    }
  }
}
