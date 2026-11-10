# Local Supabase prerequisite check

Date: 2026-11-10.

## Actually verified

- Docker Desktop is installed. It was initially stopped.
- Started it with `docker desktop start --timeout 45`.
- `docker version` now reports both client and Linux server: Docker Desktop 4.93.0, Engine 29.8.1, linux/amd64, context desktop-linux.
- WSL is installed, with Ubuntu as default distribution and default WSL version 2.
- The project dependency is Supabase CLI 3.1.0 (package metadata). There is no global Supabase command on PATH.
- Both Node-wrapper and direct executable launch failed. Windows explicitly reported: “Политика управления приложениями заблокировала этот файл” (Application Control policy blocked this file). The executable has no Authenticode signature. Its actual `--version` output could not be obtained.

## Required manual prerequisite repair

Docker does not need reinstalling. Leave Docker Desktop running. If restarting later, run `docker desktop start --timeout 45`, then `docker version`; the output must contain a Server section.

Follow-up diagnosis identified Windows Smart App Control, not an organization-managed policy. No domain, Entra ID or workplace join was detected, and enrollment entries contained no MDM discovery URL or AAD tenant ID. The earlier recommendation to seek an organization administrator's exception was incorrect for this policy.

CodeIntegrity event 3077, record 1432938, identifies policy `VerifiedAndReputableDesktop`, GUID `{0283AC0F-FFF1-49AE-ADA1-8A933130CAD6}`, with status `0xc0e90002`. Smart App Control's `VerifiedAndReputablePolicyState` is 1. No Supabase entries were found in the available AppLocker EXE/DLL (404 records) or MSI/Script (818 records) logs. Full policy enumeration with CiTool returned access denied; the blocking policy is identified directly by the event.

Both installed npm packages identify version 3.1.0; runtime version execution remains blocked. The binary is Authenticode `NotSigned`. Its SHA256 matches the executable extracted in memory from the official npm registry's `@supabase/cli-windows-x64@3.1.0` archive. The archive's SHA512 integrity was verified against registry metadata, which also matches package-lock.json. This confirms artifact identity, not a malware-free certification. There is no Zone.Identifier stream on the executable.

Microsoft documents no individual-app exception for Smart App Control and recommends asking the publisher to sign its application. Request a properly signed Windows CLI release from Supabase, providing the package version, SHA256 and policy/event details below. Feedback can also be submitted with Win+F, category Security and Privacy > Smart App Control. Do not disable protection or change PowerShell execution policy. Reinstalling the same unsigned artifact does not address the recorded trust failure.

Reference: [Microsoft Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions). No Windows security settings were changed during diagnosis.

Blocked binary:

```text
lostfound-school/node_modules/@supabase/cli-windows-x64/bin/supabase.exe
SHA256: F6ADEC9CAB13B017EEA61F75E1C54769EB520E0760453FD8A722877A8C0B30FF
```

After obtaining a trusted, signed CLI release, open PowerShell and verify:

```powershell
Set-Location -LiteralPath './lostfound-school' # Run from the repository root.
npm run supabase -- --version
npm run supabase -- --help
docker version
```

The dependency is already installed. `npm ci` restores the lockfile versions; reinstalling alone does not resolve this Smart App Control block. Official installation references: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

## Not performed

No local Supabase project initialization/config.toml, service startup, migration application, Auth/Storage configuration or credentials generation was performed. No real local integration tests ran. Docker startup success is not Supabase integration verification.

Existing SQL migrations were not edited or overwritten:

1. `20261110000000_school_mvp.sql` — SHA256 `AA108AEC7BF7152C70BA7B4A17A3AD698AC64654CF0D022E416D293BC4318550`
2. `20261110010000_staging_hardening.sql` — SHA256 `44FFEA79BE1D808C1E974A264EE963A28297CD6AA0D8681FA2916229D1B017C4`

## Resume after the CLI runs

Inspect CLI help, initialize an isolated local project without overwriting these migrations, configure local email capture with confirmation enabled, start services and apply migrations in order. Add a loopback-only integration mode: the existing staging runner intentionally rejects localhost and must not be weakened to accept arbitrary hosts. Populate gitignored local environment files from local credentials without logging them, exercise registration/confirmation and the complete API/database/Storage workflow, then run verification SQL and all tests.

No hosted Supabase tool was called in this local setup attempt. No existing hosted project, billing, Vercel, Render or GitHub remote was changed. Deployment remains unverified and outside this task's scope.
