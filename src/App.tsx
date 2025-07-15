import { BrowserRouter as Router } from 'react-router-dom';
import AppRoutes from './router';
import Navigation from './components/Navigation';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Navigation />
        <AppRoutes />
      </div>
    </Router>
  );
}

export default App;
