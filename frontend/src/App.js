import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, UserButton } from '@clerk/clerk-react';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import './App.css';

// IMPORTANT: Replace this with your actual Publishable Key from Clerk Dashboard
const CLERK_PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || 'pk_test_PLACEHOLDER_KEY';

function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <Router>
        <div className="App">
          <SignedIn>
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
                        <UserButton />
                      </li>
                    </ul>
                  </nav>
                </div>
              </div>
            </header>
            
            <main>
              <Routes>
                <Route path="/" element={<Navigate to="/devices" replace />} />
                <Route path="/devices" element={<Devices />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/settings" element={<Settings />} />
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
          </SignedIn>
          
          <SignedOut>
             <RedirectToSignIn />
          </SignedOut>
        </div>
      </Router>
    </ClerkProvider>
  );
}

export default App;