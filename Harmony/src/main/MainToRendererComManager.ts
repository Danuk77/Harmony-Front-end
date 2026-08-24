import { logger } from './logging'

type ExchangeRecord<T> = {
  id: number
  resolve: Parameters<ConstructorParameters<typeof Promise<T>>[0]>[0]
  timeout: NodeJS.Timeout
}

export type MainToRenderer2WayActionArgs =
  | {
      type: 'genSdpOfferForVideoCall'
      payload: {
        pk: string
        callID: number
      }
    }
  | {
      type: 'genSdpAnswerForVideoCall'
      payload: {
        pk: string
        offer: {
          type: 'offer'
          sdp: string
        }
        callID: number
      }
    }

export type MainToRenderer2WayActionResonse =
  | {
      type: 'genSdpOfferForVideoCall'
      payload:
        | {
            type: 'offer'
            sdp: string
          }
        | {
            type: 'error'
            msg: string
          }
    }
  | {
      type: 'genSdpAnswerForVideoCall'
      payload:
        | {
            type: 'answer'
            sdp: string
          }
        | {
            type: 'error'
            msg: string
          }
    }

const TIMEOUT = 5000 //ms

/** There is (apparently) no way to invoke a method in the renderer from the main process, and get that method to return a value.
 * Instead I am having to send a message to renderer, and then receive a separate message back with the response.
 * This class just ties the 2 halves together and returns the result in a promise.
 * */
export class MainToRendererComManager {
  private idToExchangeRecord = new Map<number, ExchangeRecord<MainToRenderer2WayActionResonse>>()
  private nextId = 0

  private sendCallback?: (id: number, args: MainToRenderer2WayActionArgs) => unknown

  constructor() {}

  public setSendCallback(callback: NonNullable<typeof this.sendCallback>) {
    this.sendCallback = callback
  }

  private dispatch(args: MainToRenderer2WayActionArgs) {
    return new Promise<MainToRenderer2WayActionResonse>((resolve, reject) => {
      if (!this.sendCallback) {
        reject('Application is still setting up')
        return
      }
      const id = this.nextId++
      const timeout = setTimeout(() => {
        reject('Timeout')
        this.idToExchangeRecord.delete(id)
      }, TIMEOUT)
      this.idToExchangeRecord.set(id, {
        id,
        timeout,
        resolve
      })
      this.sendCallback(id, args)
    })
  }

  public receiveMessageFromRenderer(id: number, response: MainToRenderer2WayActionResonse) {
    // find which message this is in response to, and call the resolver
    const record = this.idToExchangeRecord.get(id)
    if (!record) {
      logger.warn(`Got unexpected response ${id} from the renderer: ${response}`)
      return
    }
    record.resolve(response)
    this.idToExchangeRecord.delete(id)
  }

  public async genSdpOfferForVideoCall(pk: string, callID: number) {
    let result = await this.dispatch({
      type: 'genSdpOfferForVideoCall',
      payload: {
        pk,
        callID
      }
    })
    // check response type is correct
    if (result.type != 'genSdpOfferForVideoCall') {
      throw new Error(`Expected genSdpOfferForVideoCall, got ${result.type}`)
    }
    if (result.payload.type == 'error') {
      throw new Error(result.payload.msg)
    }
    return result.payload
  }

  public async genSdpAnswerForVideoCall(
    pk: string,
    offer: { type: 'offer'; sdp: string },
    callID: number
  ) {
    let result = await this.dispatch({
      type: 'genSdpAnswerForVideoCall',
      payload: {
        pk,
        offer,
        callID
      }
    })
    // check response type is correct
    if (result.type != 'genSdpAnswerForVideoCall') {
      throw new Error(`Expected genSdpAnswerForVideoCall, got ${result.type}`)
    }
    if (result.payload.type == 'error') {
      throw new Error(result.payload.msg)
    }
    return result.payload
  }
}

export const mainToRendererComManager = new MainToRendererComManager()
