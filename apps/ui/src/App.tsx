import './App.css';
import { useWallet } from './hooks/useWallet';

function App() {
  const { connect } = useWallet();

  return (
    <div>
      <h1>Hello World</h1>
      <button onClick={connect}>Connect</button>
    </div>
  )
}

export default App
