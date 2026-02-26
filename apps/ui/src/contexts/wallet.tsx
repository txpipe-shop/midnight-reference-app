import { createContext, useContext, useState, type ReactNode } from "react";
import { type ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { MIDNIGHT_NETWORK } from "@/config";

export type WalletDetails = Awaited<ReturnType<typeof getFullWallet>>;

export interface WalletContextType {
  wallet: { api: ConnectedAPI, details: WalletDetails } | undefined;
  connect: () => Promise<void>;
  error: string | undefined;
  isLoading: boolean;
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);


export interface WalletContextProps { children: ReactNode };

async function getFullWallet(wallet: ConnectedAPI) {
  return {
    configuration: await wallet.getConfiguration(),
    connectionStatus: await wallet.getConnectionStatus(),
    dustAddress: await wallet.getDustAddress(),
    dustBalance: await wallet.getDustBalance(),
    shieldedAddress: await wallet.getShieldedAddresses(),
    shieldedBalances: await wallet.getShieldedBalances(),
    unshieldedAddress: await wallet.getUnshieldedAddress(),
    unshieldedBalances: await wallet.getUnshieldedBalances(),
  }
}

export const WalletProvider: React.FC<WalletContextProps> = ({ children }) => {
  const [wallet, setWallet] = useState<WalletContextType['wallet']>();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);


  const connect = async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      if (!window.midnight) {
        setError("Midnight wallet not available in your browser");
      } else if (!window.midnight.mnLace) {
        setError("Lace wallet not in scope");
      } else {
        const api = await window.midnight.mnLace.connect(MIDNIGHT_NETWORK);
        const details = await getFullWallet(api);
        setWallet({ api, details });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to wallet");
    } finally {
      setIsLoading(false);
    }
  };


  const contextValue: WalletContextType = {
    wallet: wallet,
    connect,
    error,
    isLoading
  };

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
