import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, UserButton } from '@clerk/clerk-react';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import NotificationController from './components/NotificationController';
import ErrorBoundary from './components/ErrorBoundary';
import { LayoutDashboard, BarChart2, Settings as SettingsIcon, Bell } from 'lucide-react';
import './App.css';

// IMPORTANT: Replace this with your actual Publishable Key from Clerk Dashboard
const CLERK_PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || 'pk_test_PLACEHOLDER_KEY';

function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ErrorBoundary>
        <Router>
          <div className="App">
            <SignedIn>
            <NotificationController />
            <header className="App-header">
              <div className="container">
                <div className="header-content">
                  <div className="logo-container">
                    <img src="/logo-2.png" alt="Mistio Logo" className="app-logo" />
                  </div>
                  
                  {/* Desktop Nav */}
                  <nav className="main-nav desktop-nav">
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

                  {/* Mobile Header Icons */}
                  <div className="mobile-header-actions">
                    <button className="icon-btn">
                      <Bell size={24} />
                    </button>
                    <UserButton />
                  </div>
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
            
            <div className="mobile-bottom-nav">
              <div className="nav-items">
                <NavLink to="/devices" className={({ isActive }) => (isActive ? 'active' : '')}>
                  <LayoutDashboard size={24} />
                  <span>Devices</span>
                </NavLink>
                <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
                  <BarChart2 size={24} />
                  <span>Analytics</span>
                </NavLink>
                <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
                  <SettingsIcon size={24} />
                  <span>Settings</span>
                </NavLink>
              </div>
            </div>
            </SignedIn>
            
            <SignedOut>
             <RedirectToSignIn />
            </SignedOut>
          </div>
        </Router>
      </ErrorBoundary>
    </ClerkProvider>
  );
}

export default App;
