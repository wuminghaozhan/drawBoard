import { Routes, Route, Navigate } from 'react-router-dom';
import Test from '../pages/Test';
import ProtocolDemo from '../pages/ProtocolDemo';
import EDBDemo from '../pages/EDBDemo';
import StrokeDemo from '../pages/StrokeDemo';
import PresetDemo from '../pages/PresetDemo';
import SimpleBrushDemo from '../pages/SimpleBrushDemo';
import PerformanceDemo from '../pages/PerformanceDemo';
import CursorDemo from '../pages/CursorDemo';
import VirtualLayerDemo from '../pages/VirtualLayerDemo';
import VirtualLayerModeDemo from '../pages/VirtualLayerModeDemo';
import ErrorHandlingDemo from '../pages/ErrorHandlingDemo';
import FunctionalDemo from '../pages/FunctionalDemo';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/test" element={<Test />} />
      <Route path="/protocol" element={<ProtocolDemo />} />
      <Route path="/edb" element={<EDBDemo />} />
      <Route path="/stroke" element={<StrokeDemo />} />
      <Route path="/preset" element={<PresetDemo />} />
      <Route path="/brush" element={<SimpleBrushDemo />} />
      <Route path="/performance" element={<PerformanceDemo />} />
      <Route path="/cursor" element={<CursorDemo />} />
      <Route path="/virtual-layer" element={<VirtualLayerDemo />} />
      <Route path="/virtual-layer-mode" element={<VirtualLayerModeDemo />} />
      <Route path="/error-handling" element={<ErrorHandlingDemo />} />
      <Route path="/functional" element={<FunctionalDemo />} />
      <Route path="/" element={<Navigate to="/test" replace />} />
    </Routes>
  );
};

export default AppRoutes; 