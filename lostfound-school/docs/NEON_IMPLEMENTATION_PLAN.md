# Free managed backend implementation

Goal: preserve the React interface and Supabase compatibility while adding a separately configured Neon backend for Vercel. The user request in this conversation is the binding specification.

Architecture: Vercel React SPA and Express API; managed Neon Auth behind a restricted same-origin auth proxy; PostgreSQL business functions and RLS; private S3-compatible Neon Object Storage. No passwords are persisted by this application. Managed service availability and real email delivery remain hosted verification gates.

Global constraints: local edits and tests only; no commits, pushes, cloud provisioning, billing, production changes, or changes to Engineerus Quest. Default unconfigured state remains unavailable. Test doubles are confined to tests.

Tasks:
- [x] PostgreSQL migration, restricted runtime role, identity mapping, RLS, claims/returns, rate limits, image metadata, administrative membership management; test with PGlite.
- [x] Restricted managed auth proxy and authenticated server adapter; bounded requests, cookie handling, CSRF/redirect restrictions; tests.
- [x] Frontend provider abstraction preserving Supabase compatibility, Neon auth states, close and admin controls; browser tests authored (execution blocked).
- [x] PostgreSQL and S3 store adapters, explicit environment validation, Vercel wiring, setup and preview instructions.
- [ ] Full unit/browser/type/build verification, secret checks, independent security review.

Interfaces: Store retains its existing methods and gains optional closeItem, listMembers, manageMember. AuthContext remains profile + Store. Neon authentication verifies managed session server-side, then maps its external ID to an internal UUID. Frontend uses same-origin cookies for Neon and existing bearer tokens for Supabase. Only VITE_AUTH_PROVIDER=neon selects the new frontend; BACKEND_PROVIDER=neon selects the server. Missing configuration returns JSON 503.

Review focus: forged identities and role escalation, transaction-local identity leakage, cookie forwarding and CSRF, redirect/open proxy behavior, RLS with non-owner role, private object signing, fail-closed configuration, emitted JS compatibility, frontend privileged-key exclusion.

Rulings: retain the existing feature branch and uncommitted work; do not create commits despite skill defaults. Use explicit provider selection so published frontend behavior is preserved. Runtime/backend secrets never receive VITE_ prefixes. Preview uses synthetic accounts and an independent empty database, not a branch copied from student production data.

Progress: architecture sources verified 2026-11-11. Implementation and independent source review completed; 63 automated tests passed, TypeScript passed. Build, environment command and browser startup blocked by Windows Application Control on Rollup's native module. Hosted workflow has not run; opt-in harness fails closed without configuration. No resources, commits, pushes or deployments.

Review fixes: authorization rechecked after advisory-lock acquisition; managed renewal cookies propagated; deadlines checked before database commit; cross-tab session changes clear private state; background focus revalidation preserves unchanged-identity drafts. The final independent review's focus/draft finding was corrected and rechecked.

Ruling: use a new standalone Neon schema instead of mutating Supabase migrations, preserving the existing provider. Cost: dual adapters require regression testing. Ruling: keep all cloud email/storage/real concurrency results explicitly unverified; local embedded PostgreSQL and synthetic browser fixtures cannot prove them. Cost: release remains blocked pending approved setup and hosted tests.
