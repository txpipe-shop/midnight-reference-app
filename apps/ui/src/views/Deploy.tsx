import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";

type DeployViewProps = {
  rulesJson: string;
  onRulesJsonChange: (value: string) => void;
  isDeployEnabled: boolean;
  isDeploying: boolean;
  onBack: () => void;
  onDeploy: () => void;
};

export function DeployView({
  rulesJson,
  onRulesJsonChange,
  isDeployEnabled,
  isDeploying,
  onBack,
  onDeploy
}: DeployViewProps) {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Button variant="ghost" className="w-fit -ml-4" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Deploy Contract</h2>
        <p className="text-muted-foreground text-sm">
          Provide the immutable sponsorship campaign configuration.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rules">Sponsorship config (JSON)</Label>
          <Textarea
            id="rules"
            placeholder='{"sponsorId":"64 hex chars","acceptedColor":"64 hex chars","fixedPrice":"100","policyHash":"64 hex chars"}'
            className="font-mono min-h-[200px]"
            value={rulesJson}
            onChange={(e) => onRulesJsonChange(e.target.value)}
          />
          {rulesJson.trim().length > 0 && !isDeployEnabled && (
            <p className="text-sm text-destructive">Invalid JSON or schema mismatch.</p>
          )}
        </div>
        <Button
          disabled={!isDeployEnabled || isDeploying}
          onClick={onDeploy}
          className="w-full"
        >
          {isDeploying ? "Deploying..." : "Deploy"}
        </Button>
      </div>
    </div>
  );
}
