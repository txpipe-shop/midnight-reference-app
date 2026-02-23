import { rules as rulesBuilder } from "./scripts/humanRulesToCompact.js";

export const newRules = rulesBuilder()
  .when((r) => r.uint.eq(125))
  .or((r) => r.uint.eq(126))
  .build();
