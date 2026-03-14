/**
 * Auth abstraction layer.
 *
 * When REACT_APP_LOCAL_DEMO=true (offline convention demo) the real Clerk
 * SDK is not used at all — instead every hook returns hardcoded demo values
 * so that Clerk never makes network requests and never throws "missing
 * ClerkProvider" errors.
 *
 * When running normally the real Clerk hooks are re-exported unchanged.
 */

const IS_LOCAL_DEMO = process.env.REACT_APP_LOCAL_DEMO === 'true';

// ── Mock implementations ───────────────────────────────────────────────────────

const mockUseAuth = () => ({
  getToken: async () => 'local-demo-token',
  isSignedIn: true,
  userId: 'local-demo-user',
});

const mockUseOrganization = () => ({
  organization: {
    name: 'admin',
    slug: 'admin',
    id: 'admin',
  },
});

const mockUseUser = () => ({
  user: {
    fullName: 'Demo User',
    primaryEmailAddress: { emailAddress: 'demo@mistio.app' },
    imageUrl: null,
  },
  isLoaded: true,
});

const mockUseClerk = () => ({
  signOut: () => {},
  openUserProfile: () => {},
  openOrganizationProfile: () => {},
});

// ── Exports ───────────────────────────────────────────────────────────────────

let useAuth, useOrganization, useUser, useClerk;

if (IS_LOCAL_DEMO) {
  useAuth = mockUseAuth;
  useOrganization = mockUseOrganization;
  useUser = mockUseUser;
  useClerk = mockUseClerk;
} else {
  // Dynamic require keeps the Clerk import out of the module graph when in
  // local demo mode, avoiding "ClerkProvider is missing" errors at runtime.
  const clerk = require('@clerk/clerk-react');
  useAuth = clerk.useAuth;
  useOrganization = clerk.useOrganization;
  useUser = clerk.useUser;
  useClerk = clerk.useClerk;
}

export { useAuth, useOrganization, useUser, useClerk };
