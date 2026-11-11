# Neon validation stage — 2026-11-11

## Observed Windows failure

CodeIntegrity event **3077** identifies policy **VerifiedAndReputableDesktop**, policy version `27555.1000.240208`, GUID `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`. Status is `0xc0e90002`; requested signing level is 2, validated level is 1. Smart App Control registry state is 1 (enabled). Authenticode reports the Rollup module as unsigned.

Blocked file: `node_modules/@rollup/rollup-win32-x64-msvc/rollup.win32-x64-msvc.node`, version **4.68.2**, loaded by Node through Vite/Rollup. This is a Windows native library, not application TypeScript and not a standalone Supabase executable. Vite fails at native-library loading, before compiling application source, with `ERR_DLOPEN_FAILED`. The application source can be typechecked and the Node/PGlite/Sharp tests run successfully. Other source/build defects are not ruled out until the Linux build runs.

Installed SHA256 (also the event's flat hash):

`85D04CE92B25A9766478D94A727176156B9F436D8FAF735F05612AEE250ABB24`

Downloaded the exact official npm tarball into memory without executing or extracting files to disk. Its SHA512 matches package-lock and registry metadata. Its native binary is byte-for-byte identical to the installed file. This supports a publisher-signature/reputation block rather than local file corruption; it is not proof of universal package safety. Windows security settings, policy, file trust markers and binary contents were not changed.

Microsoft documents [3077 enforcement diagnostics](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/appcontrol-debugging-and-troubleshooting) and [Smart App Control behavior](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions). Request an appropriately signed release from the maintainer if Windows execution is needed. Do not disable SAC or attempt an ad hoc exception; use separately authorized Linux CI for validation.

## Dependency and test evidence

- package.json dependencies/devDependencies/engines agree exactly with package-lock root; lockfile version 3.
- Installed dependency tree: `npm ls --all` passed.
- Registry metadata integrity matched Rollup 4.68.2, both Windows/Linux x64 Rollup packages, Vite 6.4.6, Sharp 0.35.5, pg 8.23.1, AWS S3 client 3.1166.0 and Playwright 1.65.0.
- Lock contains Linux glibc Rollup and Sharp variants. Six nested packages without individual integrity fields are explicitly `inBundle` under Tailwind's optional WASI package, not external unlocked dependencies. Other package entries have registry resolutions and integrity hashes. A complete clean Linux install is still pending; not every installed file was independently hashed.
- Fresh `npm audit --omit=dev`: zero reported production vulnerabilities. This does not include development dependencies or prove absence of unknown vulnerabilities.
- Fresh TypeScript check: passed.
- Fresh automated suite: **63 passed, 0 failed, 0 skipped**. Includes actual embedded PostgreSQL RLS/return/persistence tests, auth boundary tests, image validation and emitted JavaScript API loading.
- Production build: failed at Windows Rollup load; not a successful build.
- Both browser suites attempted with permitted elevated process/loopback execution: Vite startup blocked by the same policy. **15 existing + 13 Neon scenarios did not execute**. Mobile/accessibility/browser console checks therefore remain unverified.
- No real Neon Auth/email, hosted PostgreSQL or S3 interaction was performed.

## Security review scope and findings

Reviewed managed Auth proxy, database adapter/migration, S3 adapter, environment boundary and API/CI wiring. No new critical or high-severity code issue identified in this focused review; this is not a penetration-test certification.

- Auth: fixed upstream URL; restricted operations and body schemas; exact-origin CSRF checks for cookie mutations; HttpOnly/Secure/SameSite cookies; live session/verified-email checks; provider roles discarded; normalized responses; bounded requests; safe redirect allowlist.
- Database: parameterized arguments; explicit restricted transaction-local roles/identity; RLS on public/private tables; narrow definer functions with pinned search paths; membership/admin checks, serialized writes, rollback/deadline checks, protected last administrator and membership audit.
- Objects: server-only scoped credentials, private bucket requirement, owner validation, Sharp conversion, constrained paths and ten-minute signed reads. Actual private-bucket configuration is unverified.
- Frontend: no database/storage credential references or server imports found in `src`; public variable allowlist rejects privileged/unknown settings. `.env.local` and `.env.preview` are ignored. A fresh emitted frontend bundle could not be inspected because the build is blocked.
- Known release gates remain: pre-login distributed abuse controls depend on managed Auth settings; signed URLs survive permission changes until expiry; interrupted/concurrent uploads can leave private orphans; real multi-connection revocation, email/reset/session behavior and storage permissions require hosted tests. Catalog/matching is not designed for unbounded scale.

## Local validation branch and Linux CI plan

Created **`codex/neon-linux-validation`** from the existing local feature branch, preserving all uncommitted changes. No commit, push, merge, remote CI dispatch, deployment or resource creation occurred.

Existing GitHub Actions workflow is structurally suitable: `ubuntu-latest`, Node 24, SHA-pinned actions, read-only contents permission, checkout credentials not persisted, locked `npm ci`, tests/build, Chrome plus system dependencies, and both Playwright suites. Added a second **credential-free Neon-mode build** to the local workflow. No secrets or deployment commands were added. [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) validates lock consistency; [Playwright supports GitHub Actions Linux runners](https://playwright.dev/docs/ci-intro).

Linux uses its own optional native binaries and is not subject to this Windows SAC policy. It can validate source compilation, Linux Sharp loading, emitted API loading, SQL tests and synthetic browser scenarios. **Compatibility is assessed, not a reported successful Linux run.** GitHub cannot test these uncommitted local changes without publishing a reviewed snapshot. Rerunning CI on the old remote commit would not validate this implementation.

Future authorized sequence:

1. Review this branch's full diff, including untracked files, and run the pre-publication secret/history scan. Do not include local env files or test credentials.
2. Before any push, ensure Vercel's Git integration will not auto-deploy this CI-only branch. This is a separate gate: the Actions workflow itself has no deployment step, but an existing Vercel Git integration can deploy on push independently. Obtain authorization for any project-setting change needed to exclude only this branch; do not alter other projects or production.
3. Obtain explicit approval to commit/push only this validation branch, using a normal push. No main merge, paid runner, resource provisioning or deployment authorization is implied.
4. Run the prepared Ubuntu workflow: clean install, 63 automated tests, default build, Neon-mode build, Chrome installation, 15 existing and 13 Neon browser scenarios. Inspect logs at the exact commit SHA. Use no service secrets. Keep failures as blockers and fix on the validation branch.
5. After Linux CI passes, separately approve independent free Neon setup and Preview integration. Only real email/Auth/SQL/S3 workflow tests can establish hosted readiness. Production needs another explicit approval.

Current blockers: local Windows native-module enforcement; no authorized published snapshot for Linux CI; unexecuted browser/build checks; absent hosted service configuration and real integration evidence. Existing Supabase resources, billing, production and other projects remain unchanged.


## CI-only publication preparation

The user authorized publication only to `codex/neon-linux-validation`.
`vercel.json` now sets `git.deploymentEnabled["codex/neon-linux-validation"]` to `false`, following [Vercel branch deployment configuration](https://vercel.com/docs/project-configuration/git-configuration). All other Vercel configuration, including SPA/API rewrites, is unchanged. The root is the previously user-confirmed `lostfound-school`; connector access to Dashboard remains unavailable. This branch rule does not change production or authorize any manual deployment.

Pre-publication checks: TypeScript passed; all 63 automated tests passed, with no skips. A minute-rollover flake in database budget assertions was fixed by evaluating each budget within one SQL statement; production rate-limit behavior was not changed. Both SQL suites still assert every allowed request and the first rejected request. History and staged-source scanning found no real credential or personal-data findings; reviewed candidates are synthetic fixtures. Sensitive environment files remain ignored.

Ubuntu CI must now validate both production builds and the 15 existing plus 13 Neon Playwright scenarios. These browser scenarios use synthetic API fixtures and do not establish live Neon service readiness. Hosted registration, verification email, private object storage and the complete live return workflow remain separate release gates. No service credentials are required by CI.
