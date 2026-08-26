# Phase 3 — Core school modules and deep course model

> Historical phase report. Its local-slice evidence is retained, but completion claims are
> superseded for current release acceptance by [`reports/remediation-audit.md`](remediation-audit.md)
> and the rebuilt traceability matrix.

Status: implemented locally as a working-draft core school slice on 2026-08-26.

## Delivered

- Expanded the shared course/program definitions with education levels, eligibility and age ranges, duration/workload, delivery/language/accessibility metadata, structured prerequisites and corequisites, permissions, outcomes, standards alignment, materials, fees and waivers, qualifications, relationships, repeatability, lifecycle, and catalog-version metadata.
- Added independently modeled offering and public-section fields, including academic periods, enrollment windows, public schedule summaries, availability freshness, campuses/locations, instructors, and fee overrides. Occurrence-specific schedule data remains outside reusable course definitions.
- Added publication-set reference resolution, prerequisite-cycle detection, dangling/type-mismatch checks, effective-period ordering, overlapping course-code checks, duplicate program-stage checks, and stable machine-readable findings.
- Replaced the Ecme course placeholder with the planned 57-course catalog across nine departments. The example includes a rich `CUL-202` definition, alternative and compound prerequisites, corequisites, permission requirements, repeatable performance courses, material fees and waivers, historical catalog evidence, a proposed-but-unpublished catalog source, three offerings, a public section, and two pathways.
- Added valid historical and invalid prerequisite-cycle fixtures plus validator tests for graph resolution and lifecycle semantics.

## Safety boundary

All Ecme data remains synthetic. The catalog publishes only deliberately public course and occurrence metadata. It contains no student records, enrollment lists, private join codes, private room access, medical information, or private staff schedules. The proposed catalog source is not matched by the configured release patterns. No external jurisdictional or institutional claims are made.

## Verification

- `pnpm format:check` — pass.
- `pnpm schema:check` — pass.
- `pnpm generate:types` — pass.
- `pnpm generate:drift` — pass.
- `pnpm typecheck` — pass.
- `pnpm test -- --runInBand` — pass; deep-model and graph tests included.
- `pnpm examples:build` — pass; 57 course items, 3 offerings, 9 departments, and 2 programs.
- `pnpm verify:determinism` — pass.
- `pnpm verify:examples` — pass.
- `pnpm build` — pass.
- `git diff --check` — pass.
