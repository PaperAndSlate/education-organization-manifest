# AGENTS.md Plan for the Target Repository

This file should be copied and adapted into the root `AGENTS.md` of the implementation repository. It defines how Codex and other coding agents must work on EOM.

## Mission

Build and maintain the Educational Organization Manifest as neutral, public-interest education infrastructure stewarded by paper&slate. Preserve interoperability, source traceability, privacy, accessibility, international applicability, and implementation independence.

## Read before editing

Before modifying protocol behavior, schemas, generated types, examples, or documentation, read:

1. `README.md`
2. `specification/`
3. the relevant file in `data-model/`
4. `architecture/SCHEMA_ENGINEERING.md`
5. `architecture/TESTING_STRATEGY.md`
6. `governance/RFC_PROCESS.md`
7. `governance/ADR_PROCESS.md`
8. `SECURITY.md`
9. the relevant module registry entry.

For work generated from this planning pack, also read the requirement traceability matrix and current phase report.

## Source-of-truth hierarchy

1. Approved specification prose and RFC decisions.
2. JSON Schema source files.
3. Semantic rule registry.
4. Conformance fixtures.
5. Generated TypeScript types and API documentation.
6. Examples.
7. explanatory documentation.

Generated artifacts must never be hand-edited. If generated output is wrong, edit its source or generator.

## Required behavior

- Keep the root manifest compact.
- Use linked resources for substantial datasets.
- Distinguish structural validation from semantic linting.
- Use absolute stable identifiers.
- Preserve course definitions separately from offerings and sections.
- Preserve source provenance and conflicts.
- Keep signatures optional in v1.
- Keep internationalization in the core.
- Prefer role-based contacts over personal contacts.
- Treat public staff fields as opt-in.
- Never model student-level data.
- Do not silently infer publication authority.
- Do not treat a successful HTTPS fetch as proof that every claim is accurate.
- Do not make the paperandslate.org service a runtime dependency for conformant publishers or consumers.

## Privacy stop conditions

Stop the task and create a privacy finding instead of adding or publishing data that appears to include:

- a student name or student identifier;
- grades, attendance, discipline, medical, IEP, 504, SEN, safeguarding, or accommodation information;
- private schedules or individual transport assignments;
- personal staff data not already deliberately public;
- authentication material, internal endpoints, or secrets;
- exact sensitive facility/security information;
- small-cell statistics likely to permit re-identification.

A redacted synthetic fixture may be created when necessary to test detection.

## Agent-generated data rules

An agent may create a candidate change but must not publish it by default.

Every extracted claim must have:

- source identifier;
- source location or evidence excerpt pointer;
- retrieval or observation time;
- extraction method;
- confidence;
- review state;
- transformation notes where applicable.

Agents must distinguish:

- explicit fact;
- normalized fact;
- mapping;
- inference;
- unresolved ambiguity.

Do not convert inference into an authoritative published field without review.

## Schema change rules

For each schema change:

1. identify the requirement or approved RFC;
2. update prose;
3. update schema source;
4. update semantic rules;
5. regenerate types/docs;
6. add valid and invalid fixtures;
7. update Ecme High when relevant;
8. test backwards compatibility;
9. update changelog/migration notes;
10. run full repository checks.

A core breaking change requires a major-version RFC. Adding an optional field may still be semantically breaking if existing consumers could misinterpret it.

## Dependency rules

- Prefer maintained, focused dependencies.
- Record architectural dependencies in an ADR.
- Pin the package manager and runtime.
- Commit the lockfile.
- Verify package licenses.
- Avoid runtime dependencies for trivial logic.
- Run vulnerability, provenance, and license checks.
- Do not add a dependency merely to avoid writing a small deterministic utility.

## Network safety

Any URL-fetching tool must:

- block loopback, private, link-local, metadata-service, and non-HTTP(S) destinations;
- revalidate every redirect;
- enforce byte, redirect, DNS, response-time, and decompression limits;
- reject userinfo in URLs;
- apply DNS rebinding defenses;
- identify itself with a documented user agent;
- avoid executing remote scripts;
- sanitize displayed remote content;
- maintain an auditable fetch report.

## Testing expectations

Run the smallest relevant tests during iteration, then the complete required suite before completion. Never weaken a test to hide a defect.

Minimum checks include:

- format/lint/typecheck;
- schema meta-validation;
- structural validation fixtures;
- semantic rule fixtures;
- generator determinism;
- generated-file drift;
- CLI integration;
- documentation links/examples;
- package boundary tests;
- security/privacy regression tests;
- conformance suite.

## Completion report

For every material task, report:

- files changed;
- requirements satisfied;
- decisions made;
- tests run and results;
- generated artifacts;
- compatibility impact;
- security/privacy impact;
- unresolved issues;
- recommended next issue.

Do not claim external registration, pilot adoption, or independent interoperability that has not actually occurred.
