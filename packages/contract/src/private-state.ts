import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';

export type PrivateState = {
  readonly secretKey: Uint8Array;
};

export const createPrivateState = (secretKey: Uint8Array): PrivateState => ({
  secretKey,
});

export const deriveSentinelAuthority = (secretKey: Uint8Array): Uint8Array => {
  if (secretKey.length !== 32) {
    throw new Error('Sentinel authority secret must be exactly 32 bytes');
  }
  const tag = new Uint8Array(32);
  tag.set(new TextEncoder().encode('dust-sponsorship:pk:'));
  return persistentHash(new CompactTypeVector(2, new CompactTypeBytes(32)), [tag, secretKey]);
};
