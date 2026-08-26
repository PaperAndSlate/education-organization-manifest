# Definition of Done

A feature, module, phase, or release is not done because code exists. The applicable criteria below must be satisfied.

## Requirement and decision coverage

- requirement has an ID;
- source decision/spec section identified;
- implementation and tests linked;
- unresolved ambiguity recorded in ADR/RFC/issue;
- no silent deviation from the approved brief.

## Specification

- normative behavior documented;
- terms defined;
- required/optional semantics explicit;
- failure behavior explicit;
- privacy class assigned;
- internationalization considered;
- versioning/compatibility impact stated;
- external mapping limitations stated.

## Schema and semantic rules

- JSON Schema source updated;
- schema meta-valid;
- generated types/docs updated;
- semantic rules added for cross-field behavior;
- stable error codes;
- valid fixture;
- one or more invalid fixtures;
- unknown-property behavior tested;
- extension behavior tested.

## Implementation

- strict types;
- package boundary respected;
- deterministic behavior where required;
- errors actionable;
- no hidden network dependency;
- no secrets;
- no unnecessary dependency;
- logging avoids sensitive content;
- public API documented.

## Tests

As applicable:

- unit;
- schema;
- semantic;
- fixture;
- integration;
- CLI;
- property/fuzz;
- security;
- privacy;
- accessibility;
- performance;
- documentation examples;
- cross-platform;
- generated drift.

Tests fail for the intended reason and are not weakened to satisfy implementation.

## Documentation

- reference;
- rationale;
- publisher example;
- consumer example;
- error/remediation example;
- migration/change note;
- Ecme High update where relevant;
- link check passes.

## Security and privacy

- threat-model entry reviewed;
- input limits defined;
- URL/network behavior safe;
- personal data classification reviewed;
- no prohibited student data;
- delegated authority constrained;
- signature/key behavior reviewed where relevant;
- dependency scan clean or risk accepted explicitly.

## Accessibility

For UI/docs features:

- semantic structure;
- keyboard operation;
- focus behavior;
- screen-reader labels;
- contrast;
- no color-only meaning;
- responsive/mobile behavior;
- reduced motion;
- accessible error summary.

## Release engineering

- changelog entry;
- package/version impact;
- generated artifacts reproducible;
- SBOM/provenance updated as applicable;
- CI green;
- phase/release report completed;
- rollback or migration path documented.

## External claims

No claim of registration, certification, adoption, independent interoperability, legal approval, or factual verification without recorded evidence.

## Module done criteria

A v1 module additionally requires:

- registry entry;
- privacy classification;
- freshness guidance;
- schema;
- semantic rules;
- examples;
- valid/invalid fixtures;
- cross-module references;
- authoring/generator support;
- validator output;
- docs;
- Ecme High instance;
- mapping notes;
- conformance coverage.

## Release done criteria

v1 is done only when:

- every required module meets module done criteria;
- all core profiles pass;
- full Ecme fixture passes;
- all release checklist items are complete or explicitly external-blocked;
- no critical/high unresolved finding;
- immutable specification/schema artifacts produced;
- registration wording is accurate;
- source archives, checksums, package provenance, and migration policy are available.
