# Codex Execution Playbook

## Working mode

Treat this as a multi-phase standards and reference-implementation project. Do not attempt to implement the entire repository in one uncontrolled pass.

For each phase:

1. read the relevant plans;
2. inspect current repository state;
3. create or update an issue checklist;
4. implement the smallest coherent vertical slice;
5. add tests and documentation in the same change;
6. run all affected checks;
7. record decisions in an ADR where architecture changes;
8. produce a phase report;
9. stop at explicit governance, registration, security, or release gates.

## First actions in an empty repository

1. Initialize Git, Node, pnpm workspace, TypeScript strict mode, linting, formatting, test runner, and CI.
2. Add licenses, governance files, security policy, contributing guide, code of conduct, issue templates, and pull-request template.
3. Create the target folder structure.
4. Copy planning decisions into stable repository documentation.
5. Add `AGENTS.md`.
6. Add a decision log and ADR template.
7. Bootstrap schemas before creating independent TypeScript models.
8. Implement the minimal school example before expanding every module.
9. Prove deterministic generation before adding signatures.
10. Add a complete Ecme High example only after the minimal pipeline is reliable.

## Required reports

At the end of each phase create:

`reports/phase-<number>-<slug>.md`

Each report must include:

- scope completed;
- files changed;
- commands run;
- test and coverage results;
- decisions made;
- unresolved questions;
- security or privacy notes;
- compatibility impact;
- next phase entry criteria.

## Change discipline

- Never hand-edit generated files.
- Never change a released schema in place.
- Never add an unnamespaced extension.
- Never add student-level data to a fixture.
- Never introduce a data field only because it exists in one U.S. system; define the international abstraction first.
- Never claim IANA registration before acceptance.
- Never make signatures mandatory in v1 without an accepted RFC.
- Never silently weaken a validator to make a fixture pass.
- Never use a real school address, identifier, person, or domain in fictitious examples.
- Never fetch arbitrary URLs in tests without a local controlled server.
- Never allow the CLI URL validator to access private network ranges by default.

## Quality gates

Every merge to main must pass:

- formatting;
- linting;
- type checking;
- unit tests;
- integration tests;
- schema meta-validation;
- valid fixture validation;
- invalid fixture rejection;
- documentation link check;
- license and provenance checks;
- generated-file drift check;
- deterministic build comparison;
- dependency and secret scanning.

## Specification gates

A schema or semantic rule change requires:

- issue or RFC reference;
- compatibility classification;
- fixture updates;
- validator updates;
- migration guidance;
- changelog entry;
- documentation update.

## Security gates

Security-sensitive work includes:

- URL fetching;
- signatures;
- key rotation;
- YAML parsing;
- archive handling;
- HTML generation;
- agent extraction;
- provenance evidence storage.

For these changes, require threat-model review and adversarial tests.

## Release gates

Do not create v1.0.0 until:

- provisional or permanent IANA registration is accepted;
- spec and schemas are internally consistent;
- Ecme High exercises all v1 modules;
- conformance suite is public;
- two independent publisher implementations or one publisher plus one independent consumer have completed an interoperability test;
- migration and deprecation policies exist;
- security and privacy reviews are complete;
- versioned schema URLs are immutable;
- release artifacts can be reproduced.
