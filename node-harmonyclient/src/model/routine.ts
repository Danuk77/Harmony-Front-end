import { FromSchema, JSONSchema } from 'json-schema-to-ts'

export type HarmonyRoutine<T> = (routineParams: HarmonyRoutineParams) => Promise<T>

export type HarmonyRoutineParams = {
  recv: <S extends JSONSchema, T = FromSchema<S>>(schema?: S) => Promise<T>
  send: (msg: object) => Promise<void>
}

export type HarmonyRoutineOptions = {
  id?: string
  // first message to be recv'd. Used when an incoming message causes a routine to be initiated - it appears here.
  firstMsg?: string
  loginRequired?: boolean
}

const harmonyRoutineDefaultOptions: HarmonyRoutineOptions = {
  id: undefined,
  firstMsg: undefined,
  loginRequired: true
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
