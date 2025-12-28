# Deployment Plan for Mistio.app

## Phase 1: Stack Alignment & Setup (Next.js Migration)
- [x] Scaffold Next.js App (`mistio-web`) to replace Vite landing page
- [x] Migrate core components (Hero, Features, etc.) to Next.js
- [x] Configure Clerk Middleware (`proxy.ts` / `middleware.ts`)
- [x] Configure Clerk Provider (`layout.tsx`)
- [x] Create `.env.local` with placeholders
- [x] Assemble Home Page (`page.tsx`) with Navbar and Footer

## Phase 2: Dashboard & Backend Configuration
- [ ] Update Dashboard (`frontend/`) to handle Clerk session
- [ ] Configure Python Backend (`api.mistio.app`) CORS and WebSocket Auth

## Phase 3: Deployment
- [ ] Deploy Landing Page (`mistio-web`) to Vercel
- [ ] Deploy Dashboard (`frontend/`) to Vercel
- [ ] Deploy Backend (`api/`) to Render/Railway

## Review Summary
- **Next.js Migration**: Successfully scaffolded `mistio-web` using Next.js App Router.
- **Clerk Integration**: Implemented strict `clerkMiddleware` (renamed to `proxy.ts` per environment warning) and `ClerkProvider` in `layout.tsx`.
- **Component Migration**: Migrated all core sections from Vite app (`Hero`, `ProblemStatement`, etc.) with full animation fidelity using Framer Motion and SVG utilities.
- **Type Safety**: Resolved TypeScript errors in `AnimatedSection` and `ProblemStatementSection` regarding Framer Motion types.
- **Build Verification**: Verified `npm run build` succeeds (fails only on runtime env var check, which is expected for placeholders).
