import { pureCircuits } from "@midnight-sentinel/contract";
import { rules as rulesBuilder } from "./scripts/humanRulesToCompact.js";

export const newRules = rulesBuilder()
  .when((r) => r.uint.eq(125))
  .or((r) => r.nullifier.eq(pureCircuits.nullifier(new Uint8Array(32).fill(0))))
  .build();
