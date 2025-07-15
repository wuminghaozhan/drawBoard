import { Routes, Route, Navigate } from 'react-router-dom';
import Test from '../pages/Test';
import ProtocolDemo from '../pages/ProtocolDemo';
import EDBDemo from '../pages/EDBDemo';
import StrokeDemo from '../pages/StrokeDemo';
import PresetDemo from '../pages/PresetDemo';
import PerformanceDemo from '../pages/PerformanceDemo';
import CursorDemo from '../pages/CursorDemo';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/test" element={<Test />} />
      <Route path="/protocol" element={<ProtocolDemo />} />
      <Route path="/edb" element={<EDBDemo />} />
      <Route path="/stroke" element={<StrokeDemo />} />
      <Route path="/preset" element={<PresetDemo />} />
      <Route path="/performance" element={<PerformanceDemo />} />
      <Route path="/cursor" element={<CursorDemo />} />
      <Route path="/" element={<Navigate to="/test" replace />} />
    </Routes>
  );
};

export default AppRoutes; 