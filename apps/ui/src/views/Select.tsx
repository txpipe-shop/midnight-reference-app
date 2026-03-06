import { Button } from "@/components/ui/button";
import { Link as LinkIcon, Rocket } from "lucide-react";

type SelectViewProps = {
  onSelectDeploy: () => void;
  onSelectJoin: () => void;
};

export function SelectView({ onSelectDeploy, onSelectJoin }: SelectViewProps) {
  return (
    <div className="flex flex-col gap-6 text-center animate-in fade-in duration-500">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to Sentinel</h1>
        <p className="text-muted-foreground">
          Log in with your wallet to deploy a new contract or join an existing one.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button
          variant="outline"
          className="h-32 flex flex-col gap-4 text-lg hover:border-primary hover:bg-primary/5 transition-all"
          onClick={onSelectDeploy}
        >
          <Rocket className="w-8 h-8 text-primary" />
          Deploy Contract
        </Button>
        <Button
          variant="outline"
          className="h-32 flex flex-col gap-4 text-lg hover:border-primary hover:bg-primary/5 transition-all"
          onClick={onSelectJoin}
        >
          <LinkIcon className="w-8 h-8 text-primary" />
          Join Contract
        </Button>
      </div>
    </div>
  );
}

