# Lost&Found School implementation plan

Date: 2026-11-10. Source: supplied technical specification and original ZIP.

## Repository audit (before product changes)

All 10 source/configuration files in the archive were inspected. React 19, TypeScript 5.7, Vite 6, Tailwind 4, React Router 7 and lucide-react. One large App.tsx implements all screens; styles.css supplies the visual design. No server, tests, migrations, lockfile, CI or environment template existed.

Routes: `/` landing; `/app` catalog; `/app/items/new` local creation; `/app/items/:id` detail; `/app/matches` heuristic pairs; `/app/my-items` browser-created entries; `/admin` unprotected statistics mock; `/login` and `/register` placeholders; wildcard 404.

Working features to preserve: Russian copy, illustrations, responsive layouts, category/type/search filters, cards, creation fields, detail presentation. Six fabricated listings are automatically loaded and saved to localStorage. Stored JSON is cast without validation. `createdByDemo` is not ownership. Authentication, uploads, editing, claims, moderation and real return confirmation are absent. Match keywords use titles rather than descriptions; list threshold 55 disagrees with detail threshold 40. No matched-attribute explanations. No loading/network error handling. Admin mock must not become real admin access.

Baseline installation succeeded with network-enabled execution (0 known vulnerabilities). Original npm build hit a Windows ampersand-path shim failure; direct TypeScript and Vite entry points passed. Details are recorded in TESTING.md. No remote infrastructure changes or pushes are authorized.

## Architecture and decisions

Retain Vite/React and current CSS. Add focused auth, API and workflow modules. Express validates bearer tokens with Supabase Auth and uses the caller's JWT for PostgreSQL operations, so RLS remains effective. A server-only Storage secret is required for sanitized uploads; all SQL operations continue to use the caller JWT. Database-controlled roles default to student, never registration metadata. School membership uses an administrator-managed email allowlist so public registration cannot expose the school catalog. Landing/auth are public; school data requires an approved, verified account.

Pending listings are visible to owners/admin only. Admin approves/rejects; editing returns approved listings to moderation. Claims link the claimant's Lost listing to another student's approved Found listing. Admin approves a claim then confirms physical return in an atomic database function; both listings become returned and competing claims are rejected. Claim evidence stays private. Images use a private bucket, server decoding/re-encoding and ownership-scoped immutable paths. Matching is deterministic, opposite types only; 30/20/20/15/15, date within three days, description keyword overlap, thresholds 70 and 40.

## Implementation sequence

- [x] 1. Record original install/typecheck/build results; preserve original UI.
- [x] 2. Add shared domain contracts and failing matching/validation tests, implement scoring and explanations, verify.
- [x] 3. Add PostgreSQL migrations: profiles/items/matches/claims, membership, RLS, moderation and atomic return functions; test SQL locally if a database runtime is available.
- [x] 4. Add Express API with auth, validation, ownership, role gates, rate limits, uploads and consistent errors. Add integration tests covering denial paths and claim workflow.
- [x] 5. Wire Supabase auth and API into existing screens; implement editing, dashboard, claims and admin actions. Remove automatic demo data. Preserve styles and mobile navigation.
- [x] 6. Verify typecheck/build/unit/API tests and desktop/mobile rendered behavior; distinguish test doubles from live Supabase evidence.
- [x] 7. Prepare env template, architecture/deployment/testing docs, CI and Vercel/Render configuration. Do not deploy or push.

## Review focus

Expired/unverified sessions must not expose school data. Registration metadata cannot promote roles. Direct Data API access must obey the same rules as Express. Simultaneous return confirmations must not return one item twice. Invalid/oversized images and database failures must produce errors without silently saving partial user input. Live auth/Storage acceptance requires an explicitly configured non-production Supabase environment; missing configuration is a blocker to live acceptance, not a reason to use demo data.

## Completion ledger and rulings

All seven local implementation steps completed; external acceptance remains pending in TESTING.md. Verified: 21 local tests, 4 browser scenarios, TypeScript/build, public Render/Vercel schema validation. A fresh independent review found invalid-pair approval after item type edits and truncated claim history; both were fixed with regression coverage.

Ruling: school membership is an operator-maintained verified-email allowlist, not a guessed school domain; it prevents arbitrary public registrations from viewing school data. Ruling: uploads need a backend-only Storage secret because permitting client Storage inserts would bypass image decoding/metadata stripping. The secret is never used for application SQL and never included in frontend configuration. Ruling: serialize school mutations with a transaction advisory lock to make return/cache updates predictable at MVP scale.

Windows application-control policy blocked the Supabase CLI, and Docker's engine was unavailable. The migration was therefore prepared locally and tested with embedded PostgreSQL; the host policy was not bypassed. No hosted project was modified. Git changes are left reviewable in the existing workspace; no commit, remote push or deployment was performed.
