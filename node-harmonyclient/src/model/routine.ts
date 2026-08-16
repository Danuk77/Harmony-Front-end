import { FromSchema, JSONSchema } from 'json-schema-to-ts'
import { TRANSACTION_SOCKET_TIMEOUT } from './TransactionHandler'

// single function that uses send() and recv() to communication.
// returns when routine is finished
export type HarmonyRoutine<T, S> = (state: S, routineParams: HarmonyRoutineParams) => Promise<T>

export type HarmonyRoutineParams = {
  recv: <S extends JSONSchema, T = FromSchema<S>>(schema?: S) => Promise<T>
  send: (msg: object) => Promise<void>
}

export type HarmonyRoutineOptions = {
  id?: Buffer
  // first message to be recv'd. Used when an incoming message causes a routine to be initiated - it appears here.
  firstMsg?: Buffer
  loginRequired: boolean
  timeout: number // ms until routine times out
}

const harmonyRoutineDefaultOptions: HarmonyRoutineOptions = {
  id: undefined,
  firstMsg: undefined,
  loginRequired: true,
  timeout: TRANSACTION_SOCKET_TIMEOUT
}
export { harmonyRoutineDefaultOptions }

// launch routine throws this if the server returns a terminate:cancel
// https://stackoverflow.com/questions/31626231/custom-error-class-in-typescript
export class HarmonyError extends Error {
  constructor(msg?: string) {
    super(msg)

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, HarmonyError.prototype)
  }
}
