import { rulesBuilder, toHex } from '@midnight-sentinel/api';

const rule = rulesBuilder()
  .when((r) => r.boolean.eq(true))
  .or((r) => r.uint.eq(1))
  .build();

const replacer = (_key: string, value: unknown) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return toHex(value);
  }
  return value;
};

console.log(JSON.stringify(rule, replacer));
