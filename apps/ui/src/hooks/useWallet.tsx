import { useContext } from "react";
import { WalletContext } from "../context/WalletContext";

export const useWallet = () => {
  const {
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
  } = useContext(WalletContext);

  if (connectWallet === undefined || disconnect === undefined) {
    throw new Error(
      "Can't call useWallet outside of the WalletProvider context",
    );
  }

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
