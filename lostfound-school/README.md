# Lost&Found School — school assessment MVP

One school, one Vercel application, one Neon project. React + TypeScript provides the existing responsive interface; Express runs in Vercel Functions under `/api`. Neon provides real authentication, PostgreSQL and private image storage. Users only need a browser.

## Assessment features

- Register, verify email, log in and log out.
- Create, view and edit Lost/Found listings; search and category/type filters.
- Deterministic Smart Match using category, color, location, date and description keywords.
- Staff moderation, private ownership claims and explicit return confirmation.
- Persistent PostgreSQL records; optional photos processed into WebP.
- Existing responsive design with SVG icons, without decorative emojis.

The admin page prioritizes moderation and returns. School access controls are collapsed until needed. There is no payment, multi-school, AI-provider or analytics service. Server authorization, membership checks, RLS, validation, rate limits and private storage remain mandatory.

## Make it work

Use only [MVP_SETUP.md](docs/MVP_SETUP.md) for the active setup and final release checklist. `.env.example` lists required settings with empty credential values. Older Supabase/Render setup documents are historical, not the active path. The previous Supabase adapter remains for compatibility and regression testing; it requires no second resource and is not used in Neon mode.

## Validation

Node.js 24, from this directory:

```text
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run test:e2e:neon
```

One existing Ubuntu GitHub Actions workflow runs these checks (build includes TypeScript) and both frontend modes. It has no deployment commands or service secrets. Browser network fixtures are test-only; production never uses them. The explicitly opted-in `test:preview:neon` harness is for the eventual real hosted workflow.

**Not live-ready yet:** Neon services are not connected, and real registration/email/storage tests have not run. Windows Application Control blocks the local Rollup build module; use authorized Linux CI without weakening Windows security. Publishing the validation branch, any Preview deployment and production release require authorization. Historical reports describe earlier snapshots; see [MVP_STATUS.md](docs/MVP_STATUS.md) for this stage.
