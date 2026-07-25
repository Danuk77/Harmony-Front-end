export type KeyPair = {
  publicKey: string
  privateKey: string
}

export const base64RegexString = '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'

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

export type IceServer = {
  urls: string
  credential?: string
  username?: string
}
