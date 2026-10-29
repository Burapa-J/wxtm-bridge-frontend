import TariL1Signer from '../../clients/tari-l1-signer'

export type TariL1SignerParameters = {
  name?: string
  onConnection?: () => void
}

export type PickMatching<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K]
}
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
export type ExtractMethods<T> = PickMatching<T, Function>
export type SignerMethods = ExtractMethods<TariL1Signer>
export type SignerMethodNames = keyof SignerMethods
export type SignerReturnType<T extends SignerMethodNames> = Awaited<ReturnType<SignerMethods[T]>>

export type SignerRequest<T extends SignerMethodNames> = {
  id: string
  methodName: T
  args: Parameters<SignerMethods[T]>
}

export type SignerResponse<T extends SignerMethodNames> = {
  id: string
  type: 'signer-call'
  result: SignerReturnType<T>
  resultError?: string
}
