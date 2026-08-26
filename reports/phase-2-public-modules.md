# Phase 2 — Public module registry and envelopes

> Historical phase report. Its local-slice evidence is retained, but completion claims are
> superseded for current release acceptance by [`reports/remediation-audit.md`](remediation-audit.md)
> and the rebuilt traceability matrix.

Status: implemented locally as a working-draft protocol slice on 2026-08-26.

## Delivered

- Registered all 22 public EOM module families in `modules/registry.json`.
- Added immutable EOM 1.0 schemas for the root organization/contact resources and the 20 typed module envelopes under `schemas/1.0/modules/`.
- Added shared item definitions for campuses, departments, deliberate-public staff, role contacts, courses, offerings, programs, calendars, events, facilities, services, policies, admissions, sports, transportation, meals, clubs, jobs, news, statistics, and API references.
- Kept module resources independently optional and closed to unknown top-level fields.
- Added deterministic valid fixtures for every typed module and a checked-in Ecme High public tree.
- Added structural, semantic, localization, path-scoped delegation, registry, and public-tree tests.

## Privacy and authority boundary

The module schemas and fixtures contain no student records, private staff data, private schedules, individual transport assignments, security layouts, credentials, or internal endpoints. Deliberate-public staff records require publication-review metadata. Cross-origin publication remains invalid unless the root supplies an active, non-transitive delegation covering the delegate origin, resource type/ID, and path.

The Ecme tree is intentionally synthetic and uses `.example` origins. It is a structural reference baseline; the deeper authoring pipeline, 57-course catalog, provenance, signatures, delegated district/vendor resources, and website projections remain later implementation slices.

## Verification

- `pnpm schema:check` — pass; 34 JSON Schema 2020-12 files checked.
- `pnpm generate:types` — pass.
- `pnpm generate:drift` — pass.
- `pnpm typecheck` — pass.
- `pnpm test -- --runInBand` — pass; 4 files and 36 tests.
- `pnpm build` — pass; all 7 buildable workspace packages.
- `git diff --check` — pass.
