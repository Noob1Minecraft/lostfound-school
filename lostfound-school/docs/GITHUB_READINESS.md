# GitHub readiness audit

Verified locally on 2026-11-10 with Node 24.14.1 and npm 11.17.0.

## Scope and results

- Reviewed repository structure, API authentication/authorization, Storage credential isolation, migration grants/RLS, environment handling, test fixtures and CI.
- `npm test`: 28 passed, zero failures. Includes API, matching, authentication, configuration, staging guards and embedded PostgreSQL RLS/return workflow tests.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite production assets generated.
- `npm run test:e2e`: four Chrome scenarios passed with mocked API responses.
- `npm audit --json`: zero reported vulnerabilities.
- Initial sandbox test attempts could not connect to loopback. Successful API/browser runs used the normal host environment; no Windows security settings were changed.

## Changes for the initial commit

- Root README identifies the application directory and verification commands.
- Root ignore rules protect environment files at every depth, private-key files, local credential files, npm configuration, browser authentication state, generated outputs and tooling state.
- Only `.env.example` and `.env.staging.example` are included; both contain blank credential fields. No real environment files were present.
- Source/test credential references were reviewed. Literal fixture tokens are deliberately fake; live integration credentials come from ignored environment files. Pattern scanning found no real-looking private keys, GitHub tokens, Supabase secret keys, JWTs, AWS keys or credential-bearing database URLs in commit candidates. This is a bounded scan, not a guarantee against every possible secret format.
- TypeScript checking now includes browser tests and Playwright configuration.
- Browser screenshot paths now use the operating system temporary directory on Windows and Linux.
- CI action references are pinned to the resolved official v4 commits. Checkout does not persist credentials. Workflow permissions are `contents: read`, with a 20-minute job timeout.

## CI verification and limits

The YAML parses successfully. CI uses Node 24, the committed npm lockfile and the correct `lostfound-school` working directory. It runs `npm ci`, the 28-test suite, the production build (which includes TypeScript checking), installs Chrome and runs the four browser scenarios. It needs no Supabase or deployment secrets and has no deployment steps.

The GitHub-hosted Ubuntu job has not run yet. Local Windows passes do not prove the hosted runner passes. Review its first run after a separately authorized push.

## Publication target

- Owner: `Noob1Minecraft`
- Name: `lostfound-school`
- Visibility: public (explicitly authorized by the owner)
- Description: `Single-school lost-and-found MVP with React, Express and Supabase`
- Initialize empty; this workspace supplies the initial commit, README and ignore rules.

The empty repository has been created. Publication of the sanitized initial commit is authorized after the security scan and local checks pass. Personal machine paths and organization identifiers have been removed from documentation; commit identity uses the owner's supplied GitHub noreply address. The original unpublished commit must not be reachable from the published branch. Deployments and hosting connections require separate authorization.

## Remaining blockers

Real Supabase Auth/email, Storage and live integration remain unverified: hosted Free Plan capacity is exhausted and Windows Smart App Control blocks the unsigned local CLI. No bypass, billing changes or existing hosted-project changes are authorized. `check:env` requires actual staging configuration and cannot pass using the blank templates alone.
