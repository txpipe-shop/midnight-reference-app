import { SentinelContract, toHex } from '@midnight-sentinel/api';
import type { Ledger } from '@midnight-sentinel/contract';

export const Rules = ({ rules }: { rules: Ledger['rules'] }) => {
  if (rules.isEmpty()) {
    return (
      <pre className="p-4 bg-muted rounded-md text-sm font-mono overflow-auto max-h-[300px]">
        No rules found
      </pre>
    );
  }

  return (
    <pre className="p-4 bg-muted rounded-md text-sm font-mono overflow-auto max-h-[300px]">
      {[...rules].map(([owner, ownerRules], idx) => (
        <div key={idx}>
          <div>Owner: {toHex(owner.bytes)}</div>
          <div>Rules: {SentinelContract.prettyRules(ownerRules)}</div>
        </div>
      ))}
    </pre>
  );
};
