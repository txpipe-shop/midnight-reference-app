import { z } from "zod";

export const ordSchema = z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
]);

export const eqSchema = z.union([
    z.literal(0),
    z.literal(1),
]);

const hexToUint8Array = (hex: string) => {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (cleanHex.length % 2 !== 0) {
        throw new Error('Hex string must have an even length');
    }
    const array = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        array[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    return array;
};

// We allow strings or numbers for bigints, and transform them to bigints
const bigintTransformRefine = z.union([z.string(), z.number(), z.bigint()]).transform((val, ctx) => {
    try {
        return BigInt(val);
    } catch (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid bigint format" });
        return z.NEVER;
    }
});

// We allow hex strings for Uint8Arrays and transform them into Uint8Arrays
const bytesTransformRefine = z.union([z.string(), z.instanceof(Uint8Array)]).transform((val, ctx) => {
    if (val instanceof Uint8Array) return val;
    try {
        return hexToUint8Array(val);
    } catch (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid hex string for bytes" });
        return z.NEVER;
    }
});

export const numberPropSchema = z.object({
    op: ordSchema,
    value: bigintTransformRefine,
});

export const booleanPropSchema = z.object({
    op: eqSchema,
    value: z.boolean(),
});

export const bytePropSchema = z.object({
    op: eqSchema,
    value: bytesTransformRefine,
});

export const fieldPropSchema = z.object({
    op: eqSchema,
    value: bigintTransformRefine,
});

export const nullifierPropSchema = z.object({
    op: eqSchema,
    nullifier: bytesTransformRefine,
});

export const propositionSchema = z.object({
    is_left: z.boolean(),
    left: numberPropSchema,
    right: z.object({
        is_left: z.boolean(),
        left: booleanPropSchema,
        right: z.object({
            is_left: z.boolean(),
            left: bytePropSchema,
            right: z.object({
                is_left: z.boolean(),
                left: fieldPropSchema,
                right: nullifierPropSchema,
            })
        })
    })
});

export const rulesSchema = z.array(
    z.object({
        is_some: z.boolean(),
        value: z.array(
            z.object({
                is_some: z.boolean(),
                value: propositionSchema,
            })
        )
    })
);

export type ParsedRules = z.infer<typeof rulesSchema>;
