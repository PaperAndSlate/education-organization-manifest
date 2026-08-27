# Phase 1 Report — Protocol Core and Validation

> Historical phase report. Its local-slice evidence is retained, but completion claims are
> superseded for current release acceptance by [`reports/remediation-audit.md`](remediation-audit.md)
> and the rebuilt traceability matrix.

- Date: 2026-08-25
- Scope: EOM 1.0 core schemas, generated types, local parsing/URI primitives, structural and semantic validation, privacy linting, CLI basics, canonical fixtures, and executable quickstart documentation
- Result: complete for the core vertical slice; broader module and network slices remain in progress

## Delivered

- JSON Schema 2020-12 source for the root manifest, resource/capability descriptors, organization profile/index, contact directory, resource index, delegation, provenance, key set, and conformance report.
- Strict JSON parsing that rejects duplicate object keys, URI/origin helpers, localized BCP 47 values, direction metadata, scoped URL checks, and private-host detection primitives.
- Deterministic generated TypeScript output at `packages/types/src/generated.ts`, with a drift check that regenerates in memory and fails on mismatch.
- Structural AJV validation and separate semantic findings for canonical identity, HTTPS scope, language defaults, IDs, references, freshness, subject membership, and cross-origin delegation.
- Privacy/security/freshness linter and a local-only `eom validate`, `eom lint`, and `eom inspect` CLI surface with JSON output.
- Passing and failing fixtures for a minimal fictional school, unknown properties, relative IDs, and prohibited student-level data.
- Generated schema catalog and an executable local publisher quickstart.

## Verification evidence

| Check                                | Result                              |
| ------------------------------------ | ----------------------------------- |
| `pnpm format:check`                  | pass                                |
| `pnpm schema:check`                  | pass — 12 JSON Schema 2020-12 files |
| `pnpm generate:drift`                | pass                                |
| `pnpm typecheck`                     | pass                                |
| `pnpm test -- --runInBand`           | pass — 3 files, 11 tests            |
| `pnpm build`                         | pass — 7 package builds             |
| `git diff --check`                   | pass                                |
| CLI validate/lint/inspect smoke test | pass                                |

## Safety and compatibility

Validation is offline by default and does not dereference remote `$ref` values or fetch publication URLs. Signatures are represented structurally but are not verified in this slice. The `.example` fixtures are fictional and do not claim live availability, registration, factual verification, certification, legal approval, or production readiness.

The test runner accepts `--runInBand` as a compatibility alias and still executes the configured Vitest suite. Per-package TypeScript configs prevent package builds from emitting unrelated workspace sources.

## Next entry criteria

The next implementation slice should add the complete public module schema registry and resource envelopes, then cover course definitions versus offerings/sections, programs/pathways, calendar/events, facilities/services/policies, admissions, sports, transportation, meals, clubs, jobs, news, statistics, and API discovery with module-specific privacy/freshness fixtures.
