import { createContext, useState, type ReactNode } from "react";
import { type ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { MIDNIGHT_NETWORK } from "@/config";

export interface WalletContextType {
  wallet: ConnectedAPI | undefined;
  connect: () => Promise<void>;
  error: string | undefined;
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);


export interface WalletContextProps { children: ReactNode };

export const WalletProvider: React.FC<WalletContextProps> = ({ children }) => {
  const [wallet, setWallet] = useState<WalletContextType['wallet']>();
  const [error, setError] = useState<string | undefined>(undefined);


  const connect = async () => {
    if (!window.midnight) {
      setError("Midnight wallet not available in your browser");
    } else if (!window.midnight.mnLace) {
      setError("Lace wallet not in scope");
    } else {
      const wallet = await window.midnight.mnLace.connect(MIDNIGHT_NETWORK);
      setWallet(wallet);
    }
  };


  const contextValue: WalletContextType = {
    wallet: wallet,
    connect,
    error
  };

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};
