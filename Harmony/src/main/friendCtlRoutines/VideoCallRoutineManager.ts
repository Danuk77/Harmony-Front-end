import { HarmonyRoutineParams } from 'node-harmonyclient/build/model/routine'
import { mainToRendererComManager } from '../MainToRendererComManager'

const waiterInterval = 5000 //ms
const maxWaits = 12

/*
  States of peers A and B.
  A is the initiator

        A      msg    B
     outgoing  ->                     A rings B
        |      <>   incoming
        |      <>     |               both send {"type":"wait"} messages while waiting for B's user to accept or reject the call...
        |      <>     |
        |      <-   expectSDPAnswer   B accepts, sends SDP offer
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
} as const

export class VideoCallRoutineManager {
  private friendPk: string
  public current?: {
    state: 'outgoing' | 'incoming' | 'expectSDPAnswer' | 'ICE'
    waitCounter: number
    waitInverval: NodeJS.Timeout | null
    send: HarmonyRoutineParams['send']
    recv: HarmonyRoutineParams['recv']
    resolve: Parameters<ConstructorParameters<typeof Promise<void>>[0]>[0]
    reject: Parameters<ConstructorParameters<typeof Promise<void>>[0]>[1]
  }

  constructor(friendPk: string) {
    this.friendPk = friendPk
  }

  public setCurrent(
    // set current without needing to provide all the internal properties
    args: Pick<NonNullable<typeof this.current>, 'send' | 'recv' | 'resolve' | 'reject' | 'state'>
  ) {
    this.current = {
      waitCounter: 0,
      waitInverval: null,
      ...args
    }
  }

  public async startRecvLoop() {
    if (!this.current) {
      console.warn('Failed to start video call recv interval - no routine')
    }

    try {
      while (this.current) {
        switch (this.current.state) {
          case 'outgoing': {
            const msg = await this.current.recv(outgoingRecvTemplate)
            switch (msg.type) {
              case 'reject': {
                this.terminateCurrentRoutine()
                return
              }
              case 'wait': {
                break
              }
              case 'acceptAndOffer': {
                let sdpOffer = msg.payload.sdp
                /**@todo send this to renderer window */
                // next message we receive should be ice candidates
                console.log(sdpOffer)
                this.current.state = 'ICE'
              }
            }
          }

          case 'incoming':
          case 'expectSDPAnswer': {
            const msg = await this.current.recv(incomingRecvTemplate)
            switch (msg.type) {
              case 'reject': {
                if (this.current.state == 'incoming') {
                  this.terminateCurrentRoutine()
                  return
                } else {
                  this.cancelCurrentRoutine('Expected an sdp answer')
                }
              }
              case 'wait': {
                break
              }
              case 'answer': {
                if (this.current.state == 'expectSDPAnswer') {
                  let sdpAnswer = msg.payload.sdp
                  /**@todo send this to renderer */
                  console.log(sdpAnswer)
                  this.current.state = 'ICE'
                } else {
                  this.cancelCurrentRoutine('Not expecting an sdp answer yet')
                }
              }
            }
          }

          case 'ICE': {
            const msg = await this.current.recv(iceRecvTemplate)
            const candidate = msg.payload
            /**@todo send this to renderer */
            console.log(candidate)
          }
        }
      }
    } finally {
      this.terminateCurrentRoutine()
    }
  }

  public startWaitLoop() {
    // waiting for the receiver to pick up/reject.
    // both peers must send a {"type": "wait"} message periodicly to prevent transaction timing out
    if (this.current?.waitInverval) {
      clearInterval(this.current.waitInverval)
    }
    if (!this.current) {
      console.error('Failed to start video call wait interval - no routine')
      return
    }

    // keep trying to send {"type": "wait"} while state is appropriate
    const interval = setInterval(async () => {
      if (
        !this.current ||
        !(this.current.state == 'incoming' || this.current.state == 'outgoing')
      ) {
        // no longer in a ringing state - stop sending waits
        clearInterval(interval)
        return
      }
      if (this.current.waitCounter++ >= maxWaits) {
        // timeout
        this.cancelCurrentRoutine()
        return
      }
      try {
        await this.current.send({ type: 'wait' })
      } catch {
        this.killCurrentRoutine()
      }
    }, waiterInterval)
    this.current.waitInverval = interval
  }

  // invoked by renderer
  public async acceptIncomingCall(): Promise<Error | null> {
    if (!this.current || this.current.state != 'incoming') {
      return Error('No incoming call to accept')
    }

    // update state
    this.current.state = 'expectSDPAnswer'
    if (this.current.waitInverval) clearInterval(this.current.waitInverval)

    const typeAndSdp = await mainToRendererComManager.genSdpOfferForVideoCall(this.friendPk)

    try {
      await this.current.send({
        type: 'acceptAndOffer',
        payload: typeAndSdp
      })
    } catch {
      this.killCurrentRoutine()
      return Error('Error sending sdp offer')
    }
    return null
  }

  // invoked by renderer
  public async rejectCall(): Promise<Error | null> {
    if (!this.current || !(this.current.state == 'incoming' || this.current.state == 'outgoing')) {
      return Error('No call to reject')
    }
    try {
      await this.current.send({
        type: 'reject',
        terminate: 'done'
      })
    } catch {}
    this.terminateCurrentRoutine()
    return null
  }

  // invoked by renderer
  public async forwardICECandidateToPeer(candidate: ICECandidate): Promise<Error | null> {
    if (!this.current || this.current.state != 'ICE') {
      return Error('Not ready to forward ICE candidates to peer')
    }

    try {
      await this.current.send({
        type: 'ICECandidate',
        payload: candidate
      })
    } catch {
      this.killCurrentRoutine()
      return Error('Error sending ICE candidate')
    }

    return null
  }

  public killCurrentRoutine() {
    // make routine error
    if (this.current) {
      this.current.reject()
      if (this.current.waitInverval) clearInterval(this.current.waitInverval)
      this.current = undefined
    }
  }

  public cancelCurrentRoutine(error?: string) {
    // send terminate: cancel
    if (this.current) {
      try {
        this.current.send({ terminate: 'cancel', ...(error ? { error } : {}) })
      } catch {}
    }
    this.terminateCurrentRoutine()
  }

  public terminateCurrentRoutine() {
    if (this.current) {
      this.current.resolve()
      if (this.current.waitInverval) clearInterval(this.current.waitInverval)
      this.current = undefined
    }
  }
}
