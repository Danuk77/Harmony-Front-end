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

// use this function for detecting when a case is not covered - place in default of a switch statement.
// @ts-ignore
export function assertNever(x: never): never {
  // throw new Error("Didn't expect to get here")
}
