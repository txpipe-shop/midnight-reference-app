import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/header";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useWallet } from "@/contexts/wallet";
import {
  SidebarProvider,
  SidebarInset
} from "@/components/ui/sidebar";
import { WalletSidebar } from "@/components/wallet-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Rocket, Link as LinkIcon } from "lucide-react";
import { rulesSchema } from "@/lib/schemas";
import type { Rules } from "@midnight-sentinel/contract";
import { SentinelContract } from '@midnight-sentinel/api'


type ViewState = "select" | "deploy" | "join";

function App() {
  const { error } = useWallet();
  const [view, setView] = useState<ViewState>("select");

  const [joinAddress, setJoinAddress] = useState("");
  const [deployRulesJson, setDeployRulesJson] = useState("");

  const parsedRules = useMemo(() => {
    if (!deployRulesJson.trim()) return null;
    try {
      const parsed = JSON.parse(deployRulesJson);
      return rulesSchema.safeParse(parsed);
    } catch {
      return null;
    }
  }, [deployRulesJson]);


  const handleDeploy = () => {
    const rules: Rules = parsedRules as unknown as Rules;
    new contractReferenceLocations
    return
  }

  const isDeployEnabled = parsedRules?.success ?? false;
  const isJoinEnabled = joinAddress.trim().length > 0;

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  return (
    <SidebarProvider>
      <SidebarInset className="flex w-full flex-col">
        <Header />
        <main className="flex-1 p-6 flex flex-col items-center justify-center">
          <div className="w-full max-w-xl mx-auto flex flex-col gap-8">
            {view === "select" && (
              <div className="flex flex-col gap-6 text-center animate-in fade-in duration-500">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tight">Welcome to Sentinel</h1>
                  <p className="text-muted-foreground">Log in with your wallet to deploy a new contract or join an existing one.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="h-32 flex flex-col gap-4 text-lg hover:border-primary hover:bg-primary/5 transition-all"
                    onClick={() => setView("deploy")}
                  >
                    <Rocket className="w-8 h-8 text-primary" />
                    Deploy Contract
                  </Button>
                  <Button
                    variant="outline"
                    className="h-32 flex flex-col gap-4 text-lg hover:border-primary hover:bg-primary/5 transition-all"
                    onClick={() => setView("join")}
                  >
                    <LinkIcon className="w-8 h-8 text-primary" />
                    Join Contract
                  </Button>
                </div>
              </div>
            )}

            {view === "deploy" && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Button variant="ghost" className="w-fit -ml-4" onClick={() => setView("select")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">Deploy Contract</h2>
                  <p className="text-muted-foreground text-sm">Provide the initial rules for your Sentinel contract.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="rules">Rules (JSON)</Label>
                    <Textarea
                      id="rules"
                      placeholder='[{"is_some": false, "value": []}]'
                      className="font-mono min-h-[200px]"
                      value={deployRulesJson}
                      onChange={(e) => setDeployRulesJson(e.target.value)}
                    />
                    {deployRulesJson.trim().length > 0 && !isDeployEnabled && (
                      <p className="text-sm text-destructive">Invalid JSON or schema mismatch.</p>
                    )}
                  </div>
                  <Button disabled={!isDeployEnabled} onClick={handleDeploy} className="w-full">
                    Deploy
                  </Button>
                </div>
              </div>
            )}

            {view === "join" && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Button variant="ghost" className="w-fit -ml-4" onClick={() => setView("select")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">Join Contract</h2>
                  <p className="text-muted-foreground text-sm">Enter the address of the existing Sentinel contract.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Contract Address</Label>
                    <Input
                      id="address"
                      placeholder="e.g. 0x0000000000000000000000000000000000000000000000000000000000000000"
                      className="font-mono"
                      value={joinAddress}
                      onChange={(e) => setJoinAddress(e.target.value)}
                    />
                  </div>
                  <Button disabled={!isJoinEnabled} className="w-full">
                    Join
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      <WalletSidebar />
      <Toaster />
    </SidebarProvider>
  );
}

export default App;
