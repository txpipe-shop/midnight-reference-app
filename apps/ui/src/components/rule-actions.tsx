import { Button } from "@/components/ui/button";
import { type SentinelContract } from "@midnight-sentinel/api";
import { useState } from "react";

interface RuleActionsProps {
  contract: SentinelContract | null;
}

export function RuleActions({ contract }: RuleActionsProps) {
  const [isUpdating, _setIsUpdating] = useState(false);

  if (!contract) return null;
  return (
    <div className="flex gap-2 mb-2">
      <Button
        size="sm"
        disabled={true}
      >
        {isUpdating ? "Updating..." : "Add Rule (Not implemented)"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={true}
      >
        {isUpdating ? "Updating..." : "Remove Rule (Not implemented)"}
      </Button>
    </div>
  );
}

