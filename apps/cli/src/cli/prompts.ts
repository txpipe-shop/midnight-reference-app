import type { Input } from '@midnight-sentinel/contract';
import type { Interface } from 'readline/promises';

export const parseHexBytes32 = (hex: string): Uint8Array => {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleanHex.length !== 64) {
    throw new Error('bytes32 must be exactly 32 bytes (64 hex characters)');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

export const askForInputs = async (rli: Interface): Promise<Input[]> => {
  const inputs: Input[] = [];

  while (true) {
    const addMore = await rli.question(
      `\nAdd input ${inputs.length + 1}? (press Enter to add, "done" to finish): `
    );
    if (addMore === 'done') break;

    console.log(`--- Input ${inputs.length + 1} ---`);
    console.log(
      'Enter space-separated values with prefixes: i<uint>, b<boolean>, x<bytes32-hex>, f<field>.'
    );
    console.log(
      'Examples: "i31 btrue", "x0x' + '0'.repeat(64) + '", "f42". Press Enter to use all defaults.'
    );

    const input: Input = {
      uint: BigInt(0),
      boolean: false,
      bytes32: new Uint8Array(32),
      field: BigInt(0),
    };

    const line = await rli.question('  Values: ');
    const tokens = line
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    for (const token of tokens) {
      const prefix = token[0];
      const value = token.slice(1);

      if (prefix === 'i') {
        try {
          const parsed = BigInt(value);
          if (parsed < 0 || parsed >= BigInt(2) ** BigInt(64)) {
            console.error('  Warning: uint out of range, keeping previous value');
          } else {
            input.uint = parsed;
          }
        } catch {
          console.error('  Warning: invalid uint token, ignoring');
        }
      } else if (prefix === 'b') {
        if (value === 'true') {
          input.boolean = true;
        } else if (value === 'false') {
          input.boolean = false;
        } else {
          console.error('  Warning: invalid boolean token, expected "btrue" or "bfalse", ignoring');
        }
      } else if (prefix === 'x') {
        try {
          input.bytes32 = parseHexBytes32(value);
        } catch (err) {
          console.error(
            `  Warning: ${
              err instanceof Error ? err.message : 'invalid bytes32 token'
            }, keeping previous value`
          );
        }
      } else if (prefix === 'f') {
        try {
          input.field = BigInt(value);
        } catch {
          console.error('  Warning: invalid field token, ignoring');
        }
      } else {
        console.error(
          `  Warning: unknown token prefix "${prefix}" in "${token}", expected one of i/b/x/f`
        );
      }
    }

    console.log(
      `\nReview Input ${inputs.length + 1}: { uint: ${input.uint}, boolean: ${input.boolean}, bytes32: ${input.bytes32.length} bytes, field: ${input.field} }`
    );
    const confirm = await rli.question(
      'Is this input correct? (y to confirm, anything else to discard and re-enter): '
    );

    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
      inputs.push(input);
      console.log(
        `Input ${inputs.length} added: { uint: ${input.uint}, boolean: ${input.boolean}, bytes32: ${input.bytes32.length} bytes, field: ${input.field} }`
      );
    } else {
      console.log('Discarding input, please re-enter.');
    }
  }

  return inputs;
};

export const askForRules = async (rli: Interface): Promise<string[]> => {
  const rules = [];
  while (true) {
    const rule: string = await rli.question(
      `Enter the rule ${rules.length + 1} (type "done" to finish): `
    );
    if (rule === 'done') break;
    rules.push(rule);
  }
  return rules;
};
