# Getting started locally

The repository is intentionally offline-first. It validates local JSON using bundled EOM 1.0 schemas and does not fetch a URL during validation.

```powershell
pnpm install --frozen-lockfile
pnpm eom validate fixtures/valid/core/minimal-school-manifest.json --json
pnpm eom lint fixtures/valid/core/minimal-school-manifest.json --json
pnpm eom inspect fixtures/valid/core/minimal-school-manifest.json --json
```

The discovery URL is `/.well-known/educational-organization-manifest`. A publisher should serve the generated root JSON there, then expose the linked resources over HTTPS. The minimal example under `examples/minimal-school/public/` contains the same root, organization profile, and role-based contact directory.

Run the local gates after changing schemas or generated output:

```powershell
pnpm format:check
pnpm schema:check
pnpm generate:drift
pnpm typecheck
pnpm test -- --runInBand
```

`--runInBand` is accepted as a compatibility alias by the repository test runner; Vitest still executes the complete configured test suite.

## Privacy boundary

EOM is a deliberate-public discovery format. Do not publish student records, grades, individual attendance, IEP/504/SEN or medical data, safeguarding or discipline records, private schedules, private transport assignments, credentials, secrets, or internal endpoints. Prefer role-based contacts and retain source/provenance and publication-review evidence in the authoring workflow.
