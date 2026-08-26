# Phase 4: interoperability mappings

> Historical phase report. Its local-slice evidence is retained, but completion claims are
> superseded for current release acceptance by [`reports/remediation-audit.md`](remediation-audit.md)
> and the rebuilt traceability matrix.

Status: implemented locally as versioned preview adapters. This report records repository behavior and does not claim external certification or conformance.

## Delivered

- a JSON Schema 2020-12 registry for versioned mapping metadata;
- ten official preview adapter formats covering Schema.org, CEDS, Ed-Fi, OneRoster, CASE, QTI, LTI, Common Cartridge, iCalendar, and JSON/RSS/Atom feeds;
- explicit public-field allowlists and loss reports for every mapping;
- source identifiers preserved as reviewable external identifiers when they are not absolute URIs;
- claim-ledger output with mapping method, source locator, observation time, confidence, privacy class, and pending owner review;
- local metadata-only parsing for XML, iCalendar, and feeds with DTD/entity/active-content rejection;
- privacy quarantine before input copying and candidate-only publication behavior;
- a dedicated Schema.org facade package and a local-only CLI `map` command;
- privacy-safe fictitious fixtures and tests for every official adapter.

## Evidence

- `schemas/1.0/mapping.schema.json`
- `mappings/registry.json`
- `packages/adapters/src/index.ts`
- `packages/schemaorg-adapter/src/index.ts`
- `packages/cli/src/index.ts`
- `fixtures/mappings/`
- `tests/mappings.test.ts`
- `spec/1.0/interoperability.md`

## Boundaries

No adapter fetches external URLs, executes imported markup, opens packages, imports private fields, publishes a canonical resource, or claims certification by an external standards body. Stable mapping status, third-party compatibility evidence, and independent external certification remain future review gates.
