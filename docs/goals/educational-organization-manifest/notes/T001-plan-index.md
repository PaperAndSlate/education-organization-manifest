# T001 Planning-Pack Review

## Scope and evidence

The entire `plans/` pack was read and indexed before product-file implementation. A SHA-256 traversal read 195 files. The pack manifest contains 194 listed files plus the manifest itself; the traversal matched all entries with zero missing, unexpected, or checksum-mismatched files. The repository working directory currently contains the planning pack and GoalBuddy control files only; it has no source tree or Git metadata.

## Authority and decision order

The master prompt establishes the decision order: `01_CONFIRMED_DECISIONS.md`, specification documents, architecture documents, data-model documents, delivery documents, then other guidance. Confirmed decisions establish EOM as a neutral, school-focused first release with structural support for all educational organizations, one compact well-known root, canonical JSON, YAML authoring, JSON Schema 2020-12, modular resources, optional signatures, explicit non-transitive delegation, internationalization, provenance/conflict preservation, and a permanent prohibition on student-level/private operational data.

The planning examples and source/output samples are explicitly illustrative. Their shorthand must not override the normative specification selected during implementation. Differences observed in sample vocabulary such as `subject` versus `subjects`, compact resource envelopes versus full envelopes, and short source type names are implementation inputs to normalize through the schema and generator rather than silent protocol rules.

## Indexed work areas

- Core brief, confirmed decisions, name/suffix research, repository blueprint, implementation principles, glossary, source bibliography, roadmap, handoff, execution playbook, pack index, pack manifest, and pack validation report.
- Specification: protocol overview, root manifest, resources/capabilities, identifiers/scope, HTTP/discovery, ownership/delegation, provenance/conflicts, privacy/publication, internationalization, versioning/extensions, signatures/integrity, conformance, and IANA registration plan.
- Architecture: monorepo/package boundaries, schema engineering, source/generated data, generator pipeline, validator/linter, reference implementation, testing, performance/caching, threat model, documentation/playground, dependency/supply-chain, and CI/release.
- Data model: common types, organizations/campuses, departments/contacts/staff, courses, offerings/sections, programs/pathways, calendars/events/news, facilities/services/policies, admissions, sports/clubs, transportation, meals/menus, jobs, statistics, APIs, module registry, and vocabularies/code lists.
- Delivery: phases, backlog, definition of done, release checklist, traceability template, and risk register.
- Governance and ownership: governance, RFC/ADR processes, contribution, licensing/IP, succession, security policy, conformance mark, CODEOWNERS, delegation hosting, multi-owner workflows, and review matrix.
- Interoperability and adoption: Schema.org, CEDS, Ed-Fi, OneRoster/CASE/QTI/LTI/Common Cartridge boundaries, import/export adapters, consumer patterns, publishing methods, use cases, vendor/district integration, and why EOM exists.
- Agentic workflow: agent rules, extraction methodology, evidence ledger, human review, prompt catalog, all reusable prompts, and all eight implementation prompts.
- Ecme High: blueprint, course catalog plan, ownership, deployment topology, validation scenarios, source YAML, expected canonical samples, delegated resources, invalid fixtures, and expected-sample README.
- Website/methodology/future/templates: website copy/tooling/integration plans, governance/identity/spec-development methods, future index and school-site boundaries, and all ADR/RFC/module/phase/review templates.

## Phase and acceptance map

| Phase | Outcome and acceptance pressure |
|---|---|
| 0 | Charter, naming status, standards research, governance/licensing, threat/privacy, ADRs, traceability, issue taxonomy; all approved decisions represented and no false registration claim. |
| 1 | Minimal root/profile/resource/capability protocol, schemas/types, validator/linter, CLI, HTTP fixtures, and minimal Ecme flow; exact well-known path can be followed and failures are actionable and layered. |
| 2 | Safe YAML authoring, deterministic modular generator, ownership/review, resolver, canonical output, reports, and `init/build/check/diff`; clean builds are byte-identical and generated drift fails. |
| 3 | Campus through admissions modules, deep course/offering/program modeling, calendars/events/facilities/services/policies, and useful Ecme catalog; each module remains optional and course definitions stay separate from offerings. |
| 4 | Sports, clubs, transportation, meals, jobs, news, statistics, APIs, registry, scale profile, and full Ecme module coverage; privacy/security-class lints and independent module omission work. |
| 5 | Source/claim/evidence/provenance/conflict/review/staleness model, safe extraction candidates, versioned prompts, PR reports, and publication gate; evidence is traceable and unapproved candidates cannot publish. |
| 6 | Scoped delegation, revocation, vendor/district fixtures, JCS/digests/detached JWS/Ed25519/key lifecycle, and sign/verify; out-of-scope/expired/revoked/transitive cases fail while unsigned v1 remains valid. |
| 7 | Accessible docs and browser tools, schema/reference explorer, validator, explorer, starter/converter/previews, provenance/signature/conformance views, and integration copy; no account or runtime paper&slate dependency. |
| 8 | Versioned profiles, complete conformance runner/corpus/reports, compatibility/release/SBOM/provenance, IANA submission draft, pilot and consumer kits, and explicit external status. |
| 9 | Only after external/review gates: immutable v1 release materials, packages, adoption/migration, and accurate registration/interoperability evidence. |

Phases 10–11 are separate future repositories/products and should be represented as boundaries and interfaces, not implemented as hidden scope in the protocol repository.

## Requirements and risk priorities

The first traceability matrix must instantiate the seed families from `delivery/REQUIREMENT_TRACEABILITY_TEMPLATE.md`: governance/name, HTTP/root/identity/resources/ownership/i18n/version/provenance/privacy/signatures/modules/course/generator/validator/CLI/conformance/docs/agents/interop/release. Each row needs source, normative section, schema pointer, implementation, tests, documentation, privacy/security, compatibility, status, and evidence.

Highest execution risks are privacy leakage, SSRF and parser/resource attacks, authority/delegation confusion, schema/prose/example drift, non-deterministic generation, course/offering collapse, AI inference being published, and false external-release claims. These become explicit fixtures and gates, not only prose.

## External gates and blocked-status rule

The repository can prepare but cannot truthfully complete IANA acceptance, independent publisher/consumer interoperability, legal review, school approval for real data, public community consensus, or third-party certification from this workspace. The implementation must create complete submission/pilot/review materials, owners, required evidence, and accurate pending/blocked wording. These task blockers do not stop safe local repository work.

## Next safe work package

Bootstrap a Git-ready pnpm/TypeScript strict monorepo and governance baseline while creating the initial requirement traceability matrix. The worker must stay within the board's allowed files, add no claims of external completion, and verify the pinned runtime/tooling plus whitespace health. The next review boundary is the first protocol-core/schema vertical slice.
