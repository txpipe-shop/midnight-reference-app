import { randomBytes } from 'node:crypto';
import { deriveSentinelAuthority } from '@midnight-sentinel/contract';

const supplied = process.argv
  .find((argument) => argument.startsWith('--secret='))
  ?.slice('--secret='.length);
if (supplied && !/^[0-9a-fA-F]{64}$/.test(supplied)) {
  throw new Error('--secret must contain exactly 32 bytes of hexadecimal');
}
const secret = supplied
  ? Uint8Array.from(Buffer.from(supplied, 'hex'))
  : Uint8Array.from(randomBytes(32));

console.log(
  JSON.stringify({
    operatorSecret: Buffer.from(secret).toString('hex'),
    operatorAuthority: Buffer.from(deriveSentinelAuthority(secret)).toString('hex'),
  })
);
