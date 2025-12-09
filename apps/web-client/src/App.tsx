import { Routes, Route } from 'react-router-dom';
import AgentPortal from './pages/AgentPortal';
import CustomerDemo from './pages/CustomerDemo';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AgentPortal />} />
      <Route path="/agent" element={<AgentPortal />} />
      <Route path="/customer" element={<CustomerDemo />} />
    </Routes>
  );
}

export default App;

