export type PrivateState = {
  readonly secretKey: Uint8Array;
}

export const createPrivateState = (secretKey: Uint8Array): PrivateState => ({ secretKey })