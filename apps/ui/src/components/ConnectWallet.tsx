import { useWallet } from "../hooks/useWallet";

export const ConnectWallet = () => {
  const { connectWallet, connectingWallet, error, status, proofServerOnline, connectedAPI, serviceUriConfig } = useWallet();

  console.log({ status, proofServerOnline, connectedAPI, serviceUriConfig });

  return (
    <div className="flex flex-col items-center justify-center">
      <button onClick={connectWallet}>Connect Lace Wallet</button>
      {connectingWallet && <p>Connecting...</p>}
      {error && <p>Error: {error.message}</p>}
    </div>
  )
}