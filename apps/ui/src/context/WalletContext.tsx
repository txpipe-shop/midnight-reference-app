import type {
  Configuration,
  ConnectedAPI,
  ConnectionStatus,
  InitialAPI,
} from "@midnight-ntwrk/dapp-connector-api";
import { createContext, type ReactNode } from "react";
import { useWalletStore } from "../hooks/useWalletStore";

export type ShieldedAddress = {
  shieldedAddress: string;
  shieldedCoinPublicKey: string;
  shieldedEncryptionPublicKey: string;
};

interface MidnightWalletProviderProps { children: ReactNode; }
export interface WalletContextType {
  connectingWallet: boolean;
  error?: any | undefined;
  initialAPI: InitialAPI | undefined;
  connectedAPI: ConnectedAPI | undefined;
  serviceUriConfig: Configuration | undefined;
  status: ConnectionStatus | undefined;
  shieldedAddresses: ShieldedAddress | undefined;
  proofServerOnline: boolean | undefined;
  connectWallet:
  | (() => Promise<void>)
  | undefined;
  disconnect: () => void;
}

export const WalletContext = createContext<WalletContextType>({
  connectingWallet: false,
  error: undefined,
  initialAPI: undefined,
  connectedAPI: undefined,
  serviceUriConfig: undefined,
  status: undefined,
  shieldedAddresses: undefined,
  proofServerOnline: false,
  connectWallet: undefined,
  disconnect: () => { },
});

export const MidnightWalletProvider = ({
  children,
}: MidnightWalletProviderProps) => {
  const value = useWalletStore();
  return (
    <WalletContext.Provider value={value}> {children} </WalletContext.Provider>
  );
};
