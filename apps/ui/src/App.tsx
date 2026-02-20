import { useEffect } from "react";
import { Header } from "@/components/header";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useWallet } from "@/contexts/wallet";
import {
  SidebarProvider,
  SidebarInset
} from "@/components/ui/sidebar";
import { WalletSidebar } from "@/components/wallet-sidebar";

function App() {
  const { error } = useWallet();

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
          {/* Basically blank content */}
        </main>
      </SidebarInset>

      <WalletSidebar />
      <Toaster />
    </SidebarProvider>
  );
}

export default App;
