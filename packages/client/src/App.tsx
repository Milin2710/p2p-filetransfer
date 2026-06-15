import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Room from './pages/Room';
import Transfer from './pages/Transfer';
import Completion from './pages/Completion';
import History from './pages/History';
import { useSocket } from './hooks/useSocket';
import GridBackground from './components/GridBackground';
import Aurora from './components/Aurora';

function AppContent() {
  useSocket();

  return (
    <>
      <GridBackground />
      <Aurora
        colorStops={['#7cff67', '#B497CF', '#5227FF']}
        blend={0.5}
        amplitude={1.0}
        speed={1}
      />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="/transfer/:roomId" element={<Transfer />} />
        <Route path="/complete/:roomId" element={<Completion />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
