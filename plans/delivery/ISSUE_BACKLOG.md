# Implementation Issue Backlog

This backlog is a seed for GitHub issues. Codex should create or import these issues, add dependencies and requirement IDs, and refine them without weakening acceptance criteria.

## Labels

`phase:*`, `area:protocol`, `area:schema`, `area:tooling`, `area:docs`, `area:privacy`, `area:security`, `area:governance`, `area:interop`, `type:rfc`, `type:adr`, `type:test`, `status:blocked-external`.

## Seed issues

| ID | Phase | Issue | Acceptance summary |
|---|---:|---|---|
| P0-001 | 0 | Create repository charter and non-goals | Charter names paper&slate as steward, EOM as neutral protocol, and excludes student records. |
| P0-002 | 0 | Recheck IANA well-known registry and naming collisions | Dated evidence is recorded; selected suffix remains a proposal; alternates documented. |
| P0-003 | 0 | Adopt governance, RFC, ADR, security, and contribution policies | All policies are linked from README and contain owner/review workflows. |
| P0-004 | 0 | Select licenses and add REUSE metadata | Software/spec/data licensing is explicit and machine-checkable. |
| P0-005 | 0 | Create requirement traceability matrix | Every approved user decision has a stable requirement ID. |
| P0-006 | 0 | Write initial threat model and privacy boundary | Assets, actors, abuse cases, and controls cover publication, validation, delegation, agents, and future crawling. |
| P0-007 | 0 | Record architecture ADRs | Runtime, monorepo, schemas, generator, error model, docs, and signatures have ADRs. |
| P0-008 | 0 | Set up issue labels and templates | Schema, protocol, tooling, privacy, security, mapping, docs, and governance changes route correctly. |
| P1-001 | 1 | Create pnpm TypeScript monorepo | Pinned runtime/package manager, strict configuration, and package boundaries pass CI. |
| P1-002 | 1 | Implement common JSON Schema definitions | Schemas use draft 2020-12 and immutable IDs. |
| P1-003 | 1 | Implement root manifest schema | Required root fields, compactness, and unknown-field behavior are tested. |
| P1-004 | 1 | Implement publisher and scope semantics | Origin/path claims cannot assert unrelated authority. |
| P1-005 | 1 | Implement resource descriptor schema | Resource type, href, media type, versions, digest, authority, freshness, and provenance supported. |
| P1-006 | 1 | Implement capability descriptor and registry | Capabilities identify versions/profiles and link to resources. |
| P1-007 | 1 | Implement organization descriptor/profile | Generic organization model plus school-focused fixture. |
| P1-008 | 1 | Implement localized text and BCP 47 validation | Plain-string shorthand normalizes only with a declared default language. |
| P1-009 | 1 | Build structural validator package | Stable machine-readable errors with JSON Pointers. |
| P1-010 | 1 | Build semantic rule engine baseline | Structural and semantic errors are separate. |
| P1-011 | 1 | Implement CLI validate/lint/inspect | Exit codes and JSON/text formats documented and tested. |
| P1-012 | 1 | Create HTTP discovery fixtures | GET/HEAD/redirect/CORS/cache/media-type cases are covered. |
| P1-013 | 1 | Create minimal Ecme High fixture | Uses only `.example` origins and clearly fictional data. |
| P1-014 | 1 | Generate TypeScript types and schema docs | Generated output is drift-checked. |
| P1-015 | 1 | Publish initial protocol quickstart | A consumer can fetch and validate the minimal fixture. |
| P2-001 | 2 | Define YAML authoring profile | Safe YAML subset, schema, limits, and normalization specified. |
| P2-002 | 2 | Implement generator configuration | Publisher, languages, source roots, outputs, and profiles are validated. |
| P2-003 | 2 | Implement modular source loader | Includes cannot escape approved roots or create cycles. |
| P2-004 | 2 | Define and implement merge rules | Duplicate IDs and conflicting owned fields fail explicitly. |
| P2-005 | 2 | Implement reference resolver | Dangling, wrong-type, and cross-scope references produce stable errors. |
| P2-006 | 2 | Implement canonical serializer | Stable ordering/normalization produces byte-identical output. |
| P2-007 | 2 | Implement build manifest and source maps | Output identifies inputs, versions, digests, and generator. |
| P2-008 | 2 | Add CLI init/build/check/diff | Commands are non-interactive-capable and documented. |
| P2-009 | 2 | Add generated-drift CI gate | Hand-edited or stale output fails. |
| P2-010 | 2 | Implement CODEOWNERS fixture and review matrix | Department owners can own source without owning release authority. |
| P2-011 | 2 | Test reproducibility across platforms | Clean builds match on supported CI systems. |
| P2-012 | 2 | Add authoring error remediation docs | Common merge/reference/YAML failures are explained. |
| P3-001 | 3 | Implement campus module | Multi-campus and single-campus organizations covered. |
| P3-002 | 3 | Implement department module | Departments link subjects, contacts, courses, programs, facilities, and owners. |
| P3-003 | 3 | Implement contact and staff modules | Role contacts preferred; named staff opt-in and expiry/review supported. |
| P3-004 | 3 | Implement deep course schema | Optional metadata, effective periods, identifiers, outcomes, credits, and alignments covered. |
| P3-005 | 3 | Implement prerequisite expression model | AND/OR groups, alternatives, notes, and cycle checks. |
| P3-006 | 3 | Implement offering schema | Catalog availability remains separate from course definition. |
| P3-007 | 3 | Implement optional section schema | Scheduled instance fields and public-data restrictions covered. |
| P3-008 | 3 | Implement program/pathway schema | Ordered/optional course groups and credentials modeled. |
| P3-009 | 3 | Implement academic calendar schema | Periods, dates, recurrence references, timezones, and exceptions covered. |
| P3-010 | 3 | Implement event schema | Public events, venues, audiences, status, and cancellation updates covered. |
| P3-011 | 3 | Implement facilities and services schemas | Security-sensitive fields are restricted/linted. |
| P3-012 | 3 | Implement policies/documents schema | Effective versions, language, media, license, and supersession covered. |
| P3-013 | 3 | Implement admissions/public enrollment profile | Public requirements and process links without applicant records. |
| P3-014 | 3 | Expand Ecme High core school fixture | Eight departments and substantial catalog with valid relationships. |
| P3-015 | 3 | Build course catalog preview | Accessible deterministic view used in docs and tests. |
| P4-001 | 4 | Implement sports module | Teams, seasons, public staff roles, venues, schedules, and privacy rules. |
| P4-002 | 4 | Implement clubs module | Student names prohibited; advisor roles deliberate-public. |
| P4-003 | 4 | Implement transportation module | Public routes/notices with no individual assignments or sensitive details. |
| P4-004 | 4 | Implement meals/menu module | Dates, meal periods, dietary/allergen statements, provider delegation. |
| P4-005 | 4 | Implement jobs module | Posting status, dates, locations, application links, public contacts. |
| P4-006 | 4 | Implement news module | Items, updates, language, media, canonical URLs, feed mapping. |
| P4-007 | 4 | Implement public statistics module | Measures, populations, periods, methods, suppression, provenance. |
| P4-008 | 4 | Implement API/service discovery module | Public documentation links; no credentials/internal endpoints. |
| P4-009 | 4 | Complete module registry | Every module has privacy class, freshness, schema, examples, and owner. |
| P4-010 | 4 | Complete Ecme High extended fixture | Every v1 module is exercised. |
| P4-011 | 4 | Create seeded privacy-invalid fixtures | Student, staff, route, facility, small-cell, and secret cases rejected/warned. |
| P4-012 | 4 | Add collection scale and paging profile | Large resources split without expanding the root. |
| P5-001 | 5 | Implement source inventory model | Sources capture identity, version, digest, rights, observation, and scope. |
| P5-002 | 5 | Implement claims/evidence ledger | Atomic claims map to resource JSON Pointers and evidence locators. |
| P5-003 | 5 | Implement conflict records | Competing claims remain visible through resolution. |
| P5-004 | 5 | Implement review decision model | Owner, rationale, selected value, and expiry are auditable. |
| P5-005 | 5 | Implement field-level public provenance | Approved evidence promotes safely without private metadata. |
| P5-006 | 5 | Implement source precedence recommendation | Precedence suggests; it does not silently overwrite. |
| P5-007 | 5 | Implement stale-data analysis | Module-aware freshness and absence-not-deletion behavior. |
| P5-008 | 5 | Create agent candidate workspace | Unapproved candidates cannot enter release output. |
| P5-009 | 5 | Version and test prompt catalog | Prompts have input/output contracts and safety metadata. |
| P5-010 | 5 | Implement PR review report generator | Evidence, conflicts, privacy, owners, and diff summarized. |
| P5-011 | 5 | Implement privacy quarantine | Prohibited data is redacted, blocked, and reported. |
| P5-012 | 5 | Build controlled extraction fixtures | Website/document/course extraction works without live uncontrolled crawling. |
| P6-001 | 6 | Implement delegation schema | Scope includes organization, module/resource, origin/path, and validity. |
| P6-002 | 6 | Implement authority evaluator | Root, publisher, maintainer, delegate, and signer are distinguished. |
| P6-003 | 6 | Implement revocation and expiry | Expired/revoked delegations fail deterministically. |
| P6-004 | 6 | Enforce non-transitive delegation | A delegate cannot redelegate without explicit root permission/profile. |
| P6-005 | 6 | Create vendor meal fixture | Ecme root explicitly authorizes vendor-hosted menu. |
| P6-006 | 6 | Create district transport fixture | School root or district hierarchy establishes valid transport authority. |
| P6-007 | 6 | Implement RFC 8785 canonicalization | Known canonical vectors pass. |
| P6-008 | 6 | Implement content digest profile | Digest creation/verification and failure modes documented. |
| P6-009 | 6 | Implement detached JWS/Ed25519 profile | Algorithm allowlist, scope binding, test vectors, and key IDs. |
| P6-010 | 6 | Implement key-set/rotation/revocation | Overlap windows and cache behavior tested. |
| P6-011 | 6 | Add CLI sign/verify | Unsigned v1 remains valid; invalid signatures are not ignored silently. |
| P6-012 | 6 | Evaluate HTTP Message Signatures experimentally | ADR/RFC records whether to defer/promote. |
| P7-001 | 7 | Build documentation information architecture | Publisher, consumer, vendor, reference, and project sections. |
| P7-002 | 7 | Generate schema/reference browser | Field types, rules, privacy, versions, and examples shown. |
| P7-003 | 7 | Build browser validator | Paste/upload/local processing and safe URL mode. |
| P7-004 | 7 | Build manifest explorer | Authority, resources, capabilities, delegation, and freshness visualized. |
| P7-005 | 7 | Build starter generator | Questionnaire creates YAML and canonical preview. |
| P7-006 | 7 | Build YAML/JSON converter | Deterministic conversion with validation. |
| P7-007 | 7 | Build course catalog preview | Filters, accessible course detail, effective-period warnings. |
| P7-008 | 7 | Build Schema.org preview/loss report | Generated JSON-LD and omitted/approximate mapping listed. |
| P7-009 | 7 | Build provenance/delegation viewers | Evidence and authority chains understandable. |
| P7-010 | 7 | Build signature verifier UI | Clear cryptographic vs factual trust distinction. |
| P7-011 | 7 | Run accessibility and security QA | Keyboard/screen-reader/upload/XSS/SSRF tests pass. |
| P7-012 | 7 | Publish paperandslate.org integration copy/assets | Working-draft status and links are correct. |
| P8-001 | 8 | Define conformance roles and profiles | Publisher, resource, consumer, generator, validator roles versioned. |
| P8-002 | 8 | Build conformance runner | Black-box and fixture modes emit stable reports. |
| P8-003 | 8 | Complete valid/invalid corpus | Every normative MUST has positive/negative coverage where testable. |
| P8-004 | 8 | Create compatibility matrix | Spec, schema, packages, prompts, mappings, and profiles aligned. |
| P8-005 | 8 | Create IANA registration submission draft | Template fields, security/privacy considerations, change controller. |
| P8-006 | 8 | Decide media type strategy | ADR/RFC records JSON media type approach. |
| P8-007 | 8 | Decide link-relation strategy | Reuse existing relation or prepare proposal only if justified. |
| P8-008 | 8 | Prepare pilot publisher kit | Deployment, review, privacy, feedback, and rollback. |
| P8-009 | 8 | Prepare independent consumer test kit | Expected behavior without sharing implementation details. |
| P8-010 | 8 | Create release SBOM/provenance pipeline | Artifacts trace to source and dependencies. |
| P8-011 | 8 | Run external review triage process | Feedback categorized and resolved through governance. |
| P8-012 | 8 | Create release candidate status page | External gates and limitations are explicit. |
| P9-001 | 9 | Complete registration gate | IANA status recorded accurately. |
| P9-002 | 9 | Resolve critical/high audits | No unresolved critical/high security/privacy findings. |
| P9-003 | 9 | Record interoperability evidence | Independent publisher/consumer evidence or explicit blocker. |
| P9-004 | 9 | Freeze immutable v1 specification and schemas | URLs, archives, checksums, and redirects verified. |
| P9-005 | 9 | Publish v1 packages and source archive | Release checklist, provenance, signatures, and changelog complete. |
| P9-006 | 9 | Publish adoption and migration materials | Quickstarts, examples, and vNext process available. |

## Backlog rules

- Link every issue to one or more traceability requirements.
- Add dependency relationships rather than relying only on issue order.
- External gates stay open with `status:blocked-external` until evidence exists.
- A broad issue may be split, but its acceptance criteria must be preserved in child issues.
- Privacy and security findings receive dedicated issues and are not hidden inside general cleanup.
- Do not close a schema issue until prose, schema, semantic rules, generated types, fixtures, Ecme example, and docs agree.
- Phase reports must list closed, carried, added, and blocked issues.
