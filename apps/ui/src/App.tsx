import { Contract } from '@midnight-reference-app/contract';
import './App.css';
import { ConnectWallet } from './components/ConnectWallet';
import { MidnightWalletProvider } from './context/WalletContext';

function App() {

  console.log(Contract)
  return (
    <MidnightWalletProvider>
      <div>
        <h1>Hello World</h1>
        <ConnectWallet />
      </div >
    </MidnightWalletProvider>
  )
}

export default App
