# Local UI and authentication update

## Design and implementation

The existing Vite/React architecture and Russian-language school workflows are retained. The chosen approach is an incremental component redesign: replacing decorative imagery and consolidating layout styles avoids a framework migration and preserves the tested API contracts. The identity uses primary `#6258E8`, accent `#FFCC58`, and background `#F7F8FD`, with darker text and status colors for readability.

- Removed application emojis, emoji avatars, rotated sticker shapes and emoji fallback images. Category fallbacks use a shared Lucide SVG mapping. No cartoon replacements or external image assets were added.
- Rebuilt the hero as a CSS/SVG service diagram, explicitly labelled as illustrative rather than real listings.
- Updated navigation, mobile menu, search/filter state, cards, details, dashboard statistics, Smart Match, admin controls and auth layouts.
- Added visible keyboard focus, Escape-to-close mobile navigation with focus return, filter pressed state, accessible status/error messages, responsive grids and reduced-motion rules.
- Split auth forms and common feedback components out of App. Added email/password confirmation, recovery request and reset routes, field validation and clear provider-error mapping.
- Corrected the auth initialization loading race. Supabase SDK owns session persistence/refresh; passwords are held only in form state and cleared after successful sensitive operations.

## Auth behavior and security boundaries

`/login`, `/register`, `/forgot-password` and `/reset-password` are public routes. Without public Supabase configuration they show an unavailable state and collect no credentials. No test accounts or fixture data are compiled into production source.

Signup sends only display name in user metadata, not a role. Confirmation instructions are shown after a successful signup request. Supabase must have email confirmation enabled; this UI cannot enforce the provider's Dashboard configuration by itself.

Recovery requests use `resetPasswordForEmail` with the current origin plus `/reset-password`; the message does not disclose whether the account exists. Recovery sessions arrive through the SDK's URL processing and `PASSWORD_RECOVERY` event. The reset form requires a session, confirms the new password, calls `updateUser`, clears password fields, and signs out after success. Missing/expired links cannot expose a working password editor. Ordinary authenticated sessions can also change their own password; the provider enforces authorization.

Login errors are mapped by code; raw provider errors/tokens are not rendered. Protected routes wait for restored session and API profile checks. Students cannot gain admin UI access through signup data; server role checks and database RLS remain authoritative even if a client is modified. Logout failures are surfaced and never presented as successful logout.

Reference: [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Required Supabase setup before live verification

- Dedicated authorized project, migrations, school-member allowlist, operator-controlled admin profile.
- Email/password provider, confirmation enabled, anonymous login disabled, minimum password length of 12, appropriate throttling, working email delivery.
- Site URL set to the frontend origin. Explicit redirect allowlist entries for `/login` and `/reset-password` for each authorized local/staging/production origin; no broad production wildcards.
- Browser variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL` pointing to the verified API. Never use privileged keys in `VITE_*`.
- Backend: matching project URL/public key, server-only Storage key, origin and proxy configuration, using the Vercel-only migration plan.
- Test actual signup email, confirmation link, invalid login, persistence/refresh, logout, recovery email, expired link and password update with real staging accounts.

Supabase capacity remains unavailable and the local CLI is blocked by Windows Smart App Control. Live authentication is not claimed. Browser auth tests intercept HTTP with synthetic fixtures only; they verify UI/SDK integration, not delivery or provider configuration.

## Frontend publication after authorization

No push or deployment is part of this work. After review and explicit approval, publish the local changes to the existing repository and let the connected Vercel project build the approved commit. Use root `lostfound-school`, Vite, Node 24, `npm ci`, `npm run build`, output `dist`. The existing SPA rewrite supports the new auth routes. Keep Supabase variables unset until the backend and Supabase are verified; the redesigned public site can be deployed in that disabled state.

Do not create Render services. See [Vercel-only architecture](VERCEL_ONLY_ARCHITECTURE.md) for future API work and current blockers.

## Changed files and local verification

Updated: `README.md`, `src/App.tsx`, `src/auth.tsx`, `src/catalog.tsx`, `src/data.ts`, `src/items.tsx`, `src/styles.css`, `src/workflows.tsx`, `shared/domain.ts`, `package.json`, `package-lock.json`, `playwright.config.ts`, `e2e/school.spec.ts`, `docs/TESTING.md`.

Added: `src/AuthPage.tsx`, `src/icons.tsx`, `src/ui.tsx`, `shared/auth-errors.ts`, `tests/auth-errors.test.ts`, `tests/ui-source.test.ts`, `e2e/fixtures.ts`, `e2e/auth.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/unconfigured.spec.ts`, `docs/REDESIGN_AUTH.md`, `docs/VERCEL_ONLY_ARCHITECTURE.md`.

Final local checks: 30 automated tests and 15 browser scenarios passed; TypeScript and production build passed. Accessibility, mobile, secret-scan evidence and limitations are recorded in [TESTING.md](TESTING.md). No production assets, external projects or credentials were changed.
