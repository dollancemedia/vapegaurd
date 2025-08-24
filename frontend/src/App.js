import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import './App.css';
// No need to import logo from public folder, we'll use the public URL

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <div className="container">
            <div className="header-content">
              <div className="logo-container">
                <img src="/logo.svg" alt="Vape Detection System Logo" className="app-logo" />
                <h1>VapeGuard</h1>
              </div>
              <nav className="main-nav">
                <ul>
                  <li><Link to="/" className="active">Dashboard</Link></li>
                  <li><Link to="/devices">Devices</Link></li>
                  <li><Link to="/analytics">Analytics</Link></li>
                  <li><Link to="/settings">Settings</Link></li>
                </ul>
              </nav>
            </div>
          </div>
        </header>
        
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/analytics" element={<div className="container mt-5"><h2>Analytics - Coming Soon</h2></div>} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        
        <footer className="app-footer">
          <div className="container">
            <div className="footer-content">
              <div className="footer-logo">
                <img src="/logo.svg" alt="Vape Detection System Logo" className="footer-logo-img" />
                <span>VapeGuard</span>
              </div>
              <div className="footer-links">
                <ul>
                  <li><Link to="/">Home</Link></li>
                  <li><Link to="/about">About</Link></li>
                  <li><Link to="/contact">Contact</Link></li>
                  <li><Link to="/privacy">Privacy Policy</Link></li>
                </ul>
              </div>
              <div className="footer-copyright">
                <p>© {new Date().getFullYear()} VapeGuard - Advanced Vape Detection System</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;