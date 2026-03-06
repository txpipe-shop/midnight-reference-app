import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

type JoinViewProps = {
  joinAddress: string;
  onJoinAddressChange: (value: string) => void;
  isJoinEnabled: boolean;
  isJoining: boolean;
  onBack: () => void;
  onJoin: () => void;
};

export function JoinView({
  joinAddress,
  onJoinAddressChange,
  isJoinEnabled,
  isJoining,
  onBack,
  onJoin
}: JoinViewProps) {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Button variant="ghost" className="w-fit -ml-4" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Join Contract</h2>
        <p className="text-muted-foreground text-sm">
          Enter the address of the existing Sentinel contract.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="address">Contract Address</Label>
          <Input
            id="address"
            placeholder="e.g. 0x0000000000000000000000000000000000000000000000000000000000000000"
            className="font-mono"
            value={joinAddress}
            onChange={(e) => onJoinAddressChange(e.target.value)}
          />
        </div>
        <Button
          disabled={!isJoinEnabled || isJoining}
          onClick={onJoin}
          className="w-full"
        >
          {isJoining ? "Joining..." : "Join"}
        </Button>
      </div>
    </div>
  );
}

