# Contributing to EOM

Contributions are welcome from school and district practitioners, curriculum teams, web-standard implementers, vendors, accessibility and internationalization reviewers, security/privacy specialists, and developers.

## Before opening a change

- Read `AGENTS.md`, the relevant specification and data-model docs, the traceability matrix, and the current phase report.
- Open an issue for semantic, schema, module, conformance, security, privacy, or governance changes.
- Use an RFC for new core fields, modules, profiles, version behavior, signatures, IANA/media/link registrations, or breaking changes.
- Use an ADR for implementation architecture.
- Keep all examples synthetic and use reserved `.example` origins.
- Never hand-edit generated artifacts; update their schema/source/generator and run the drift check.

## Pull requests

Every PR should describe its protocol impact, compatibility classification, tests, documentation, generated output, security/privacy review, internationalization, accessibility, and required owners. Source changes must be reviewed before generated output is considered.

AI-assisted contributions are permitted when the contributor remains responsible for evidence, licensing, privacy, tests, and the final change. Agents create reviewable candidates and pull requests; they do not publish by default.

## Licensing

Software, schemas, tests, and tooling use Apache-2.0. Specification and documentation use CC BY 4.0. Marked fictional example data uses CC0 1.0. Contributors must have the right to submit their work and should use DCO sign-off unless a later governance decision adopts another agreement.
