import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, UserButton, useOrganization } from '@clerk/clerk-react';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import TrainAI from './pages/TrainAI';
import NotificationController from './components/NotificationController';
import ErrorBoundary from './components/ErrorBoundary';
import { LayoutDashboard, BarChart2, Settings as SettingsIcon, Brain } from 'lucide-react';
import './App.css';

const CLERK_PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || 'pk_test_PLACEHOLDER_KEY';

function AppContent() {
  const { organization } = useOrganization();
  const isAdmin = organization?.name === 'admin' || organization?.slug === 'admin';

  return (
    <>
      <NotificationController />

      <header className="App-header">
        <div className="header-content">
          <div className="logo-container">
            <a href="https://mistio.app">
              <img src="/logo-2.png" alt="Mistio Logo" className="app-logo" />
            </a>
          </div>

          <nav className="desktop-nav">
            <ul className="mistio-nav-group">
              <li>
                <NavLink to="/devices" className={({ isActive }) => isActive ? 'active' : ''}>
                  Devices
                </NavLink>
              </li>
              <li>
                <NavLink to="/analytics" className={({ isActive }) => isActive ? 'active' : ''}>
                  Analytics
                </NavLink>
              </li>
              {isAdmin && (
                <li>
                  <NavLink to="/train" className={({ isActive }) => isActive ? 'active' : ''}>
                    Train AI
                  </NavLink>
                </li>
              )}
              <li>
                <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
                  Settings
                </NavLink>
              </li>
            </ul>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <UserButton />
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/devices" replace />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/analytics" element={<Analytics />} />
          {isAdmin && <Route path="/train" element={<TrainAI />} />}
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <div className="mobile-bottom-nav">
        <div className="nav-items">
          <NavLink to="/devices" className={({ isActive }) => isActive ? 'active' : ''}>
            <LayoutDashboard size={22} />
            <span>Devices</span>
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => isActive ? 'active' : ''}>
            <BarChart2 size={22} />
            <span>Analytics</span>
          </NavLink>
          {isAdmin && (
            <NavLink to="/train" className={({ isActive }) => isActive ? 'active' : ''}>
              <Brain size={22} />
              <span>Train AI</span>
            </NavLink>
          )}
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
            <SettingsIcon size={22} />
            <span>Settings</span>
          </NavLink>
        </div>
      </div>
    </>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ErrorBoundary>
        <Router>
          <div className="App">
            <SignedIn>
              <AppContent />
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
