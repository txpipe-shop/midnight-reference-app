/**
 * Rules follow the struct in packages/contract/src/sentinel.compact:
 *   type Rules = Disjunction<2,2>  (Vector<2, Conjunction<2>>)
 * i.e. DNF with exactly 2 OR-clauses and 2 AND-terms per clause:
 *   (A && B) || (C && D)
 *
 * Examples:
 *   (A && B) || (C && D):
 *     rules().when(r => r.uint.gt(123).and(r => r.uint.lt(456))).or(r => r.uint.eq(0).and(r => r.uint.eq(0))).build()
 *   (A && B) || C:
 *     rules().when(r => r.uint.gt(123).and(r => r.uint.lt(456))).or(r => r.uint.eq(0)).build()
 */

import {
  Eq,
  Ord,
  type BooleanProp,
  type ByteProp,
  type FieldProp,
  type NullifierProp,
  type NumberProp,
  type Proposition,
  type Rules,
} from '@midnight-sentinel/contract';
import { z } from 'zod';

// --- Dummy right-hand side for Proposition (unused branches when we only set one variant) ---
const emptyBytes32 = (): Uint8Array => new Uint8Array(32);

const emptyNullifierRight: NullifierProp = {
  op: Eq.EQ,
  nullifier: emptyBytes32(),
};

const emptyFieldRight: {
  is_left: boolean;
  left: FieldProp;
  right: NullifierProp;
} = {
  is_left: false,
  left: { op: Eq.EQ, value: 0n },
  right: emptyNullifierRight,
};

const emptyByteRight: {
  is_left: boolean;
  left: ByteProp;
  right: typeof emptyFieldRight;
} = {
  is_left: false,
  left: { op: Eq.EQ, value: emptyBytes32() },
  right: emptyFieldRight,
};

const emptyBooleanRight: {
  is_left: boolean;
  left: BooleanProp;
  right: typeof emptyByteRight;
} = {
  is_left: false,
  left: { op: Eq.EQ, value: false },
  right: emptyByteRight,
};

/** Proposition "right" branch when we only use the left (NumberProp) branch */
const propositionRightDummy = emptyBooleanRight;

/** Dummy proposition for is_some: false slots (AND neutral); value is never evaluated. */
const dummyProposition: Proposition = numberProposition({
  op: Ord.EQ,
  value: 0n,
});

// --- Proposition builders (one branch set, rest dummy) ---
function numberProposition(prop: NumberProp): Proposition {
  return {
    is_left: true,
    left: prop,
    right: propositionRightDummy,
  };
}

function booleanProposition(prop: BooleanProp): Proposition {
  return {
    is_left: false,
    left: { op: Ord.EQ, value: 0n },
    right: {
      is_left: true,
      left: prop,
      right: emptyByteRight,
    },
  };
}

function byteProposition(prop: ByteProp): Proposition {
  return {
    is_left: false,
    left: { op: Ord.EQ, value: 0n },
    right: {
      is_left: false,
      left: { op: Eq.EQ, value: false },
      right: {
        is_left: true,
        left: prop,
        right: emptyFieldRight,
      },
    },
  };
}

function fieldProposition(prop: FieldProp): Proposition {
  return {
    is_left: false,
    left: { op: Ord.EQ, value: 0n },
    right: {
      is_left: false,
      left: { op: Eq.EQ, value: false },
      right: {
        is_left: false,
        left: { op: Eq.EQ, value: emptyBytes32() },
        right: {
          is_left: true,
          left: prop,
          right: emptyNullifierRight,
        },
      },
    },
  };
}

function nullifierProposition(prop: NullifierProp): Proposition {
  return {
    is_left: false,
    left: { op: Ord.EQ, value: 0n },
    right: {
      is_left: false,
      left: { op: Eq.EQ, value: false },
      right: {
        is_left: false,
        left: { op: Eq.EQ, value: emptyBytes32() },
        right: {
          is_left: false,
          left: { op: Eq.EQ, value: 0n },
          right: prop,
        },
      },
    },
  };
}

// --- Selector: r.uint.eq(2) etc. ---

function toBigInt(v: number | bigint): bigint {
  return typeof v === 'bigint' ? v : BigInt(v);
}

function toBytes32(v: Uint8Array | number[]): Uint8Array {
  if (v instanceof Uint8Array) return v;
  return new Uint8Array(v);
}

type Clause = {
  is_some: boolean;
  value: { is_some: boolean; value: Proposition }[];
};

/** Something that can be converted to a clause (pair or single term). */
type ClauseLike = ClauseBuilder | PropositionBuilder;

/**
 * Builder for a single proposition that can be chained with .and() to form a clause.
 * Can also be used alone in .when() / .or() for (A && B) || C — the missing slot is is_some: false.
 */
class PropositionBuilder {
  constructor(private readonly prop: Proposition) { }

  /**
   * Combine this proposition with another to form a clause (pair): (this && other).
   * Returns a ClauseBuilder that can be passed to .when() or .or().
   */
  and(other: PropositionBuilder | ((r: RuleSelector) => PropositionBuilder)): ClauseBuilder {
    const otherProp = typeof other === 'function' ? other(r).prop : other.prop;
    return new ClauseBuilder(this.prop, otherProp);
  }

  /**
   * Convert to a single-term clause: [this, is_some: false].
   * Used when writing (A && B) || C; the missing D is encoded as is_some: false.
   */
  toClause(): Clause {
    return {
      is_some: true,
      value: [
        { is_some: true, value: this.prop },
        { is_some: false, value: dummyProposition },
      ],
    };
  }
}

/**
 * Builder for a clause (pair of propositions): (prop1 && prop2).
 * Created by calling .and() on a PropositionBuilder.
 */
class ClauseBuilder {
  constructor(
    private readonly prop1: Proposition,
    private readonly prop2: Proposition
  ) { }

  /** Internal: convert to clause format */
  toClause(): Clause {
    return {
      is_some: true,
      value: [
        { is_some: true, value: this.prop1 },
        { is_some: true, value: this.prop2 },
      ],
    };
  }
}

const r = {
  uint: {
    eq: (v: number | bigint) =>
      new PropositionBuilder(numberProposition({ op: Ord.EQ, value: toBigInt(v) })),
    neq: (v: number | bigint) =>
      new PropositionBuilder(numberProposition({ op: Ord.NEQ, value: toBigInt(v) })),
    gt: (v: number | bigint) =>
      new PropositionBuilder(numberProposition({ op: Ord.GT, value: toBigInt(v) })),
    lt: (v: number | bigint) =>
      new PropositionBuilder(numberProposition({ op: Ord.LT, value: toBigInt(v) })),
    gte: (v: number | bigint) =>
      new PropositionBuilder(numberProposition({ op: Ord.GTE, value: toBigInt(v) })),
    lte: (v: number | bigint) =>
      new PropositionBuilder(numberProposition({ op: Ord.LTE, value: toBigInt(v) })),
  },
  boolean: {
    eq: (v: boolean) => new PropositionBuilder(booleanProposition({ op: Eq.EQ, value: v })),
    neq: (v: boolean) => new PropositionBuilder(booleanProposition({ op: Eq.NEQ, value: v })),
  },
  bytes32: {
    eq: (v: Uint8Array | number[]) =>
      new PropositionBuilder(byteProposition({ op: Eq.EQ, value: toBytes32(v) })),
    neq: (v: Uint8Array | number[]) =>
      new PropositionBuilder(byteProposition({ op: Eq.NEQ, value: toBytes32(v) })),
  },
  field: {
    eq: (v: number | bigint) =>
      new PropositionBuilder(fieldProposition({ op: Eq.EQ, value: toBigInt(v) })),
    neq: (v: number | bigint) =>
      new PropositionBuilder(fieldProposition({ op: Eq.NEQ, value: toBigInt(v) })),
  },
  nullifier: {
    eq: (v: Uint8Array | number[]) =>
      new PropositionBuilder(nullifierProposition({ op: Eq.EQ, nullifier: toBytes32(v) })),
    neq: (v: Uint8Array | number[]) =>
      new PropositionBuilder(nullifierProposition({ op: Eq.NEQ, nullifier: toBytes32(v) })),
  },
} as const;

/** Selector type for building propositions: r.uint.eq(2), r.boolean.eq(true), etc. */
type RuleSelector = typeof r;

// --- Fixed DNF(2,2) builder: (A && B) || (C && D) or (A && B) || C ---

// DNF(2,2): AND_TERMS_PER_CLAUSE=2, OR_CLAUSES=2
const OR_CLAUSES = 2;

class RulesBuilder {
  private clauses: Clause[] = [];

  /**
   * Add the first OR-clause: (A && B) or just A.
   * Callback may return ClauseBuilder (from .and()) or a single PropositionBuilder.
   * Example: .when(r => r.uint.gt(123).and(r => r.uint.lt(456)))  or  .when(r => r.uint.eq(0))
   */
  when(fn: (r: RuleSelector) => ClauseLike): RulesBuilder {
    if (this.clauses.length >= OR_CLAUSES) {
      throw new Error(
        `Rules allows exactly ${OR_CLAUSES} OR-clauses (DNF<2,2>). Already have ${this.clauses.length}.`
      );
    }
    this.clauses.push(fn(r).toClause());
    return this;
  }

  /**
   * Add another OR-clause: (C && D) or just C.
   * Callback may return ClauseBuilder (from .and()) or a single PropositionBuilder.
   * Missing second term is encoded as is_some: false.
   * Example: .or(r => r.uint.eq(0).and(r => r.uint.eq(0)))  or  .or(r => r.uint.eq(5))
   */
  or(fn: (r: RuleSelector) => ClauseLike): RulesBuilder {
    if (this.clauses.length >= OR_CLAUSES) {
      throw new Error(
        `Rules allows exactly ${OR_CLAUSES} OR-clauses (DNF<2,2>). Already have ${this.clauses.length}.`
      );
    }
    this.clauses.push(fn(r).toClause());
    return this;
  }

  build(): Rules {
    if (this.clauses.length !== OR_CLAUSES) {
      throw new Error(
        `Rules requires exactly ${OR_CLAUSES} OR-clauses (DNF<2,2>). Got ${this.clauses.length}. Call .when() and .or() once each before .build().`
      );
    }
    return this.clauses as Rules;
  }
}

export function rules(): RulesBuilder {
  return new RulesBuilder();
}

enum ZodOrd { GT = 0, LT = 1, EQ = 2, NEQ = 3, GTE = 4, LTE = 5 }
enum ZodEq { EQ = 0, NEQ = 1 }
const OrdSchema = z.nativeEnum(ZodOrd);
const EqSchema = z.nativeEnum(ZodEq);

const BigIntSchema = z.union([
  z.bigint(),
  z.string().transform((v, ctx) => {
    try {
      return BigInt(v);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid bigint string",
      });
      return z.NEVER;
    }
  }),
]);

const Uint8ArraySchema = z.union([
  z.instanceof(Uint8Array),
  z.array(z.number().int().min(0).max(255))
    .transform((arr) => new Uint8Array(arr)),
]);

const NumberPropSchema = z.object({
  op: OrdSchema,
  value: BigIntSchema,
});

const BooleanPropSchema = z.object({
  op: EqSchema,
  value: z.boolean(),
});

const BytePropSchema = z.object({
  op: EqSchema,
  value: Uint8ArraySchema,
});

const FieldPropSchema = z.object({
  op: EqSchema,
  value: BigIntSchema,
});

const NullifierPropSchema = z.object({
  op: EqSchema,
  nullifier: Uint8ArraySchema,
});

const PropositionSchema: z.ZodType<any> = z.object({
  is_left: z.boolean(),
  left: NumberPropSchema,
  right: z.object({
    is_left: z.boolean(),
    left: BooleanPropSchema,
    right: z.object({
      is_left: z.boolean(),
      left: BytePropSchema,
      right: z.object({
        is_left: z.boolean(),
        left: FieldPropSchema,
        right: NullifierPropSchema,
      }),
    }),
  }),
});

const PropositionOptionSchema = z.object({
  is_some: z.boolean(),
  value: PropositionSchema,
});

export const RulesSchema = z.array(
  z.object({
    is_some: z.boolean(),
    value: z.array(PropositionOptionSchema),
  })
);

export function validateRules(input: unknown): Rules {
  return RulesSchema.parse(input);
}

export const parsedHelper = (_key: string, value: unknown) => {
  if (typeof value === "string") {
    if (value.startsWith("0x")) {
      const clean = value.slice(2);
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
      }
      return bytes;
    }

    if (/^-?\d+$/.test(value)) {
      return BigInt(value);
    }
  }

  return value;
};