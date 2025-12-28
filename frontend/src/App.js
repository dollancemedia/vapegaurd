import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Analytics from './pages/Analytics';
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
                <img src="/logo.png" alt="VapeGuard Logo" className="app-logo" style={{ height: '40px', width: 'auto' }} />
              </div>
              <nav className="main-nav">
                <ul>
                  <li>
                    <NavLink to="/devices" className={({ isActive }) => (isActive ? 'active' : '')}>Devices</NavLink>
                  </li>
                  <li>
                    <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>Analytics</NavLink>
                  </li>
                  <li>
                    <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>Settings</NavLink>
                  </li>
                  <li>
                    <NavLink to="/login" className="profile-link">
                      <div className="profile-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                      </div>
                    </NavLink>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </header>
        
        <main>
          <Routes>
            <Route path="/" element={<Devices />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/login" element={<Login />} />
          </Routes>
        </main>
        
        <footer className="app-footer">
          <div className="container">
            <div className="footer-content">
              <div className="footer-logo">
                <img src="/logo.png" alt="VapeGuard Logo" className="footer-logo-img" style={{ height: '30px', width: 'auto' }} />
              </div>
              <div className="footer-links">
                <ul>
                  <li><a href="/privacy">Privacy Policy</a></li>
                  <li><a href="/terms">Terms of Service</a></li>
                  <li><a href="/contact">Contact Us</a></li>
                </ul>
              </div>
              <div className="footer-copyright">
                &copy; {new Date().getFullYear()} VapeGuard. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;