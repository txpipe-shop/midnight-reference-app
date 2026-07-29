import { Button } from "@/components/ui/button";
import type { SentinelContract, SentinelDerivedState } from "@midnight-sentinel/api";
import { ArrowLeft } from "lucide-react";

type ContractViewProps = {
  contract: SentinelContract;
  contractState: SentinelDerivedState | null;
  onBack: () => void;
};

export function ContractView({
  contract,
  contractState,
  onBack
}: ContractViewProps) {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Button variant="ghost" className="w-fit -ml-4" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>
      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Contract Dashboard</h2>
          <p className="text-muted-foreground text-sm font-mono bg-muted p-2 rounded-md break-all">
            {contract.deployedContract?.deployTxData.public.contractAddress}
          </p>
        </div>

        {contractState ? (
          <div className="space-y-6">
            <div className="space-y-2 p-4 border rounded-md">
              <h3 className="text-lg font-semibold">Owner</h3>
              <p className="font-mono text-sm break-all">{contractState.owner}</p>
            </div>

            <div className="space-y-2 p-4 border rounded-md">
              <h3 className="text-lg font-semibold">Sponsorship campaign</h3>
              <p>Enabled: {contractState.sponsorshipEnabled ? "yes" : "no"}</p>
              <p>Price: {contractState.sponsorshipFixedPrice.toString()}</p>
              <p>Revenue: {contractState.sponsorshipRevenue.toString()}</p>
              <p>Purchases: {contractState.sponsorshipPurchases.toString()}</p>
            </div>
          </div>
        ) : (
          <div className="p-12 flex items-center justify-center border rounded-md">
            <p className="text-muted-foreground animate-pulse">Loading contract state...</p>
          </div>
        )}
      </div>
    </div>
  );
}
