# Educational Organization Manifest (EOM)

Educational Organization Manifest is a proposed open protocol stewarded by paper&slate for publishing deliberately public, machine-readable information about schools, districts, colleges, universities, training providers, and other educational organizations.

The protocol starts at one predictable HTTPS resource:

```text
/.well-known/educational-organization-manifest
```

The root stays compact. It declares identity, scope, capabilities, authority, versioning, and linked resources. Rich information—courses, offerings, programs, calendars, events, facilities, services, policies, admissions, sports, clubs, transportation, meals, jobs, news, statistics, and public APIs—lives in independently validatable modules.

## Status

This repository is an implementation-ready working draft. The well-known URI suffix is proposed and is not claimed to be IANA-registered. The Ecme High School data is wholly fictional and uses reserved `.example` domains.

EOM is not a student information format. It must never contain student records, grades, individual attendance, IEP/504/SEN/medical/safeguarding or discipline records, private schedules, private transportation assignments, secrets, credentials, or internal-only endpoints.

## Repository map

- `spec/` — normative, versioned protocol prose, ADRs, and RFCs.
- `schemas/` — JSON Schema 2020-12 source of truth and versioned catalog.
- `packages/` — TypeScript reference implementation, validator, linter, generator, CLI, signatures, testkit, and adapters.
- `examples/` — minimal, multilingual, delegated, signed, district, and complete fictional school publications.
- `fixtures/` — valid, invalid, security, privacy, conformance, migration, and signature cases.
- `apps/docs/` — static documentation site.
- `apps/playground/` — client-side browser playground for local validation and exploration.
- `prompts/` — evidence-led generation and review prompts; candidates never publish directly.
- `reports/` — phase, security, conformance, and release evidence.
- `requirements/` — requirement-to-artifact traceability.
- `plans/` — the approved implementation planning pack that initiated this repository.

## Quick start

Requires Node.js 24.17.0 (the active LTS pinned for this implementation) and pnpm 10.6.0.

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm eom --help
pnpm conformance
pnpm release:check
```

If a lockfile is not yet present, run `pnpm install` once from a clean checkout and commit the resulting `pnpm-lock.yaml` before using `--frozen-lockfile` in CI.

## Design commitments

- HTTPS origin control is the root authority; paper&slate is a steward, not a data owner.
- JSON Schema 2020-12 is the structural source of truth; generated TypeScript is never hand-edited.
- Canonical wire output is deterministic UTF-8 JSON; YAML is authoring convenience only.
- Course definitions are distinct from offerings and sections.
- Provenance, effective dates, review status, and conflicts are first-class.
- Cross-origin resources require explicit, scoped, time-bounded, non-transitive delegation by default.
- Signatures and integrity metadata are implemented as optional v1 capabilities.
- Unknown top-level properties fail; extensions are namespaced under `extensions`.
- Local validation works offline and networked tooling uses SSRF-safe fetch controls.

Read the [protocol overview](spec/1.0/protocol.md), [publisher quickstart](docs/publisher-quickstart.md), and [project status](docs/project-status.md) to begin.

The release-candidate packet is generated with `pnpm release:prepare`; it includes immutable
specification/schema copies, checksums, a source archive, SBOM, and explicitly unsigned local
provenance metadata. See [conformance](docs/conformance.md) and [release evidence](release/README.md).

## Governance and status language

Conformance means that a named implementation passed a named profile and test suite. It does not verify school quality, legal compliance, accreditation, or factual truth. See [governance](GOVERNANCE.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md), and the [registration draft](spec/1.0/iana-registration.md).

The project is stewarded by paper&slate but is designed to be independently implemented without a paper&slate account, API, or runtime service.
