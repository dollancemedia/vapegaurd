import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, UserButton } from '@clerk/clerk-react';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import NotificationController from './components/NotificationController';
import ErrorBoundary from './components/ErrorBoundary';
import { LayoutDashboard, BarChart2, Settings as SettingsIcon } from 'lucide-react';
import './App.css';

const CLERK_PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || 'pk_test_PLACEHOLDER_KEY';
const IS_LOCAL_DEMO = process.env.REACT_APP_LOCAL_DEMO === 'true';

// ── Shared inner layout (nav + routes) used by both Clerk and local-demo paths ─
function AppShell() {
  return (
    <div className="App">
      <NotificationController />

      <header className="App-header">
        <div className="header-content">
          <div className="logo-container">
            {IS_LOCAL_DEMO ? (
              <span style={{
                fontSize: 20, fontWeight: 800, color: '#14b8a6',
                letterSpacing: '-0.02em',
              }}>
                MISTIO
              </span>
            ) : (
              <a href="https://mistio.app">
                <img src="/logo-2.png" alt="Mistio Logo" className="app-logo" />
              </a>
            )}
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
              <li>
                <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
                  Settings
                </NavLink>
              </li>
            </ul>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            {IS_LOCAL_DEMO ? (
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#14b8a6',
                background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.3)',
                borderRadius: 6, padding: '3px 8px', letterSpacing: '0.05em',
              }}>
                ACSEF DEMO
              </span>
            ) : (
              <UserButton />
            )}
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
          <NavLink to="/devices" className={({ isActive }) => isActive ? 'active' : ''}>
            <LayoutDashboard size={22} />
            <span>Devices</span>
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => isActive ? 'active' : ''}>
            <BarChart2 size={22} />
            <span>Analytics</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
            <SettingsIcon size={22} />
            <span>Settings</span>
          </NavLink>
        </div>
      </div>
    </div>
  );
}

function App() {
  // ── Local demo mode: skip Clerk entirely so no network calls are made ─────
  if (IS_LOCAL_DEMO) {
    return (
      <ErrorBoundary>
        <Router>
          <AppShell />
        </Router>
      </ErrorBoundary>
    );
  }

  // ── Normal mode: full Clerk auth ───────────────────────────────────────────
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ErrorBoundary>
        <Router>
          <div className="App">
            <SignedIn>
              <AppShell />
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
