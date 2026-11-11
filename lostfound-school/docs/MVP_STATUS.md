# School assessment MVP status

## Branch audit

Read-only remote check confirmed `origin/main` at `c20e6f90197433a82dff98207eb2bdd3a4f1ef50` and API Preview at `412ac2881a0fa19c4b4696617f6f1da63e95f8bf`. Main contains the published frontend and Supabase-oriented implementation; the API branch adds the Vercel adapter and safeguards. Neon code is still **uncommitted local work** on `codex/neon-linux-validation`, based on the API branch. That validation branch has not been pushed. No main changes, merges or deployments occurred.

## Chosen scope

React/TypeScript → same-origin Vercel Function `/api` → one Free Neon project containing managed Auth, PostgreSQL and private Object Storage. Keep the existing layout, palette, SVG icons and responsive CSS. No additional backend service, new infrastructure abstraction or database provider migration is needed.

The source audit found no multi-school feature, payment processing, AI integration or external analytics in the active application. Existing dashboard counts are simple record totals. Removed the secondary admin statistics panel and its API request; the existing statistics endpoint stays compatible. Moderation and return confirmation remain immediately available. Access management is now collapsed and loads only when opened, retaining admission/role security. Ordinary student controls are unchanged.

README now points to a single active connection guide, `MVP_SETUP.md`. The environment template contains only Neon settings. Historical setup reports and the working Supabase adapter remain for compatibility, not as additional setup requirements. Existing Node/API test tooling is development-only; users never run a local server.

## Seven capabilities

| Capability | Local status | Live gate |
|---|---|---|
| Real registration/login/logout | Managed Auth proxy and UI implemented; boundary tests pass; no fake production sessions | Configure provider, verify actual email and session behavior |
| Create/view/edit Lost/Found | API, ownership validation and PostgreSQL functions tested | Real hosted CRUD workflow |
| Search/filter | Existing title/description/location/color search and type/category filters retained | Browser execution |
| Deterministic Smart Match | Existing 30/20/20/15/15 scoring and 40/70 thresholds tested; no AI key/service | Hosted paired listings |
| Admin moderation/returns | Server roles, private claims and return transaction pass embedded PostgreSQL tests | Bootstrap real admin and verify handoff workflow |
| Persistent database | Migration, RLS, atomicity and PGlite dump/restore pass | Connect Neon and verify reload across real sessions |
| Responsive interface | Existing CSS/design retained; browser inventory covers mobile/accessibility | Linux browser suite must execute |

## Actual checks this stage

- `npm run typecheck`: passed.
- `npm test`: **63 passed, 0 failed, 0 skipped**.
- Both Playwright `--list` commands: passed discovery, **15 existing + 13 Neon scenarios**. Membership scenario updated for the collapsed section. Discovery is not browser execution.
- `npm run build`: TypeScript stage passed; Vite execution remains blocked by Windows Application Control on Rollup's native module. No security workaround attempted.
- `git diff --check`: passed.
- No Linux CI or hosted integration run; no cloud resources or credentials created. Previous mocked-provider tests and embedded PostgreSQL tests do not establish real managed service compatibility.

## Files changed in this simplification stage

- `src/workflows.tsx`: prioritize moderation/returns; remove admin statistics UI/request; lazy collapsed school access.
- `e2e-neon/neon.spec.ts`: verify access form starts absent and opens through the disclosure.
- `.env.example`: one-provider Neon configuration only, no secrets.
- `README.md`: assessment scope and single setup entry point.
- `docs/MVP_SETUP.md`: exact one-project connection steps and final deployment checklist.
- `docs/MVP_STATUS.md`: audit, scope and verification report.

All earlier local Neon implementation files remain pending alongside these changes; this list is not a claim that the entire working tree has only six changes. No CSS, runtime security policy, migrations or production configuration were changed in this stage.

## Readiness and next action

**Not production-ready yet.** The shortest remaining path is configuration and validation, not more feature development:

1. Approve independent Free Neon setup, then follow `MVP_SETUP.md`: one migration, restricted database login, managed Auth, private bucket and environment variables.
2. Restore access needed to verify Vercel Git settings and isolate any CI-only branch from automatic deployment. After separate publication approval, run the already-prepared single Ubuntu workflow: tests, default/Neon builds and both browser suites. It has no deployment step or service secrets.
3. Authorize Preview testing with synthetic data in the same Vercel/Neon projects; verify the real two-student/admin return workflow and protected routes.
4. Only after all checks pass, approve production publication with production origin/variables. Keep Preview isolated from real student data and retain the prior frontend deployment for rollback.

No paid resource, Engineerus Quest, existing Supabase project, Windows policy, GitHub push or production deployment was modified.
