import { type ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { useState } from "react";

export const useWallet = () => {
  const [wallet, setWallet] = useState<ConnectedAPI | null>(null);

  const connect = async () => {
    try {
      if (!window.midnight || !window.midnight.mnLace) throw new Error("Wallet not found");
      const api = await window.midnight.mnLace.connect("undeployed");
      setWallet(api);
    } catch (error) {
      console.error(error);
    }
  }

  return {
    wallet,
    connect,
  }
}