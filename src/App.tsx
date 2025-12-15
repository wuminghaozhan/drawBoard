import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import Home from './pages/Home';
import SelectionDemo from './pages/SelectionDemo';
import TransformDemo from './pages/TransformDemo';
import GeometryDemo from './pages/GeometryDemo';
import ProtocolDemo from './pages/ProtocolDemo';
import StrokeDemo from './pages/StrokeDemo';
import PresetDemo from './pages/PresetDemo';
import SimpleBrushDemo from './pages/SimpleBrushDemo';
import CursorDemo from './pages/CursorDemo';
import PerformanceDemo from './pages/PerformanceDemo';
import EDBDemo from './pages/EDBDemo';
import Test from './pages/Test';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/selection" element={<SelectionDemo />} />
            <Route path="/transform" element={<TransformDemo />} />
            <Route path="/geometry" element={<GeometryDemo />} />
            <Route path="/protocol" element={<ProtocolDemo />} />
            <Route path="/stroke" element={<StrokeDemo />} />
            <Route path="/preset" element={<PresetDemo />} />
            <Route path="/brush" element={<SimpleBrushDemo />} />
            <Route path="/cursor" element={<CursorDemo />} />
            <Route path="/performance" element={<PerformanceDemo />} />
            <Route path="/edb" element={<EDBDemo />} />
            <Route path="/test" element={<Test />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
