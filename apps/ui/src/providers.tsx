import { ThemeProvider } from "@/components/theme-provider";
import { WalletProvider } from "@/contexts/wallet";
import { type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
    return (
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <WalletProvider>
                {children}
            </WalletProvider>
        </ThemeProvider>
    );
}
