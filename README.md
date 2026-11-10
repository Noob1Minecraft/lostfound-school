# Lost&Found School

A single-school lost-and-found MVP with React, TypeScript, Express and Supabase.

Application code, setup instructions and architecture are in [lostfound-school](lostfound-school/README.md).

```sh
cd lostfound-school
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Use Node.js 24. Browser tests require Chrome (`npx playwright install chrome`).
CI runs local tests and the build without Supabase credentials; browser scenarios use mocked APIs.
Live Supabase integration remains unverified. See [local environment status](lostfound-school/docs/LOCAL_SUPABASE_STATUS.md).

Only blank environment templates belong in Git. Keep real credentials and live-test accounts in ignored local environment files. No deployment or automatic hosted-resource provisioning is enabled by the CI workflow.
