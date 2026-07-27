import { Header } from "@/components/header";
import {
  SidebarInset,
  SidebarProvider
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { WalletSidebar } from "@/components/wallet-sidebar";
import { useWallet } from "@/contexts/wallet";
import { DeployView } from "@/views/Deploy";
import { JoinView } from "@/views/Join";
import { SelectView } from "@/views/Select";
import { SentinelContract, type SentinelDerivedState } from '@midnight-sentinel/api';
import { initializeProviders } from '@midnight-sentinel/api/browser';
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ContractView } from "./views/Contract";

type ViewState = "select" | "deploy" | "join" | "contract";

const hex32 = z.string().regex(/^(?:0x)?[0-9a-fA-F]{64}$/).transform((value) => {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  return Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  );
});
const sponsorshipConfigSchema = z.object({
  sponsorId: hex32,
  acceptedColor: hex32,
  fixedPrice: z.union([z.string(), z.number()]).transform((value) => BigInt(value)),
  policyHash: hex32,
});

function App() {
  const { wallet, error } = useWallet();
  const [view, setView] = useState<ViewState>("select");
  const [isDeploying, setIsDeploying] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const [activeContract, setActiveContract] = useState<SentinelContract | null>(null);
  const [contractState, setContractState] = useState<SentinelDerivedState | null>(null);

  const [joinAddress, setJoinAddress] = useState("");
  const [deployRulesJson, setDeployRulesJson] = useState("");

  useEffect(() => {
    if (!activeContract) return;
    const sub = activeContract.state$.subscribe((state) => {
      setContractState(state);
    });
    return () => sub.unsubscribe();
  }, [activeContract]);

  const parsedRules = useMemo(() => {
    if (!deployRulesJson.trim()) return null;
    try {
      const parsed = JSON.parse(deployRulesJson);
      return sponsorshipConfigSchema.safeParse(parsed);
    } catch {
      return null;
    }
  }, [deployRulesJson]);


  const handleDeploy = async () => {
    if (!parsedRules?.success) return;
    if (!wallet) {
      toast.error("Wallet not connected");
      return;
    }

    setIsDeploying(true);
    try {
      const providers = await initializeProviders(wallet.api);
      const contract = await SentinelContract.deploy(
        providers,
        parsedRules.data
      );
      setActiveContract(contract);
      setView("contract");
      toast.success(
        `Deployed at ${contract.deployedContract?.deployTxData.public.contractAddress}`
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to deploy contract");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleJoin = async () => {
    if (!joinAddress.trim()) return;
    if (!wallet) {
      toast.error("Wallet not connected");
      return;
    }

    setIsJoining(true);
    try {
      const providers = await initializeProviders(wallet.api);
      const contract = await SentinelContract.join(
        providers,
        joinAddress
      );

      setActiveContract(contract);
      setView("contract");

      toast.success(`Successfully joined contract`, { richColors: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to join contract", { richColors: true });
    } finally {
      setIsJoining(false);
    }
  };

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
          <div className="w-full max-w-4xl mx-auto flex flex-col gap-8">
            {view === "select" && (
              <SelectView
                onSelectDeploy={() => setView("deploy")}
                onSelectJoin={() => setView("join")}
              />
            )}

            {view === "deploy" && (
              <DeployView
                rulesJson={deployRulesJson}
                onRulesJsonChange={setDeployRulesJson}
                isDeployEnabled={isDeployEnabled}
                isDeploying={isDeploying}
                onBack={() => setView("select")}
                onDeploy={handleDeploy}
              />
            )}

            {view === "join" && (
              <JoinView
                joinAddress={joinAddress}
                onJoinAddressChange={setJoinAddress}
                isJoinEnabled={isJoinEnabled}
                isJoining={isJoining}
                onBack={() => setView("select")}
                onJoin={handleJoin}
              />
            )}

            {view === "contract" && activeContract && (
              <ContractView
                contract={activeContract}
                contractState={contractState}
                onBack={() => setView("select")}
              />
            )}
          </div>
        </main>
      </SidebarInset>

      <WalletSidebar />
      <Toaster />
    </SidebarProvider >
  );
}

export default App;
