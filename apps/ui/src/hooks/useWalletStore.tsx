import type {
  Configuration,
  ConnectedAPI,
  ConnectionStatus,
  InitialAPI,
} from "@midnight-ntwrk/dapp-connector-api";
import { useCallback, useState } from "react";
import { MidnightBrowserWalletApi } from "../api/wallet";
import type { ShieldedAddress, WalletContextType } from "../context/WalletContext";

export const useWalletStore = (): WalletContextType => {
  const [connectingWallet, setConnectingWallet] = useState<boolean>(false);
  const [error, setError] = useState<any>();
  const [initialAPI, setInitialAPI] = useState<InitialAPI>();
  const [connectedAPI, setConnectedAPI] = useState<ConnectedAPI>();
  const [serviceUriConfig, setServiceUriConfig] = useState<Configuration>();
  const [status, setStatus] = useState<ConnectionStatus>();
  const [shieldedAddresses, setShieldedAddresses] = useState<ShieldedAddress | undefined>(undefined);
  const [proofServerOnline, setProofServerOnline] = useState<boolean>(false);
  const [walletInstance, setWalletInstance] =
    useState<MidnightBrowserWalletApi>();

  const connectWallet = useCallback(
    async () => {
      setConnectingWallet(true);

      try {
        const midnightBrowserWalletInstance =
          await MidnightBrowserWalletApi.connectToWallet();
        setInitialAPI(midnightBrowserWalletInstance.initialAPI);
        setConnectedAPI(midnightBrowserWalletInstance.connectedAPI);
        setError(undefined);
        setServiceUriConfig(midnightBrowserWalletInstance.serviceUriConfig);
        setStatus(midnightBrowserWalletInstance.status);
        setShieldedAddresses(midnightBrowserWalletInstance.shieldedAddresses);
        setProofServerOnline(midnightBrowserWalletInstance.proofServerOnline);
        setWalletInstance(midnightBrowserWalletInstance);
      } catch (error) {
        setError(error);
      }
      setConnectingWallet(false);
    },
    [],
  );

  const disconnect = useCallback(() => {
    walletInstance?.disconnect();
    setInitialAPI(undefined);
    setConnectedAPI(undefined);
    setError(undefined);
    setServiceUriConfig(undefined);
    setStatus(undefined);
    setShieldedAddresses(undefined);
    setProofServerOnline(false);
  }, []);

  return {
    connectingWallet,
    error,
    initialAPI,
    connectedAPI,
    serviceUriConfig,
    status,
    shieldedAddresses,
    proofServerOnline,
    connectWallet,
    disconnect,
  };
};
