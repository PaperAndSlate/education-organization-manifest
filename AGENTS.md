# Agent Instructions for EOM

## Mission

Maintain the Educational Organization Manifest as neutral, public-interest education infrastructure stewarded by paper&slate. Preserve interoperability, source traceability, privacy, accessibility, international applicability, and implementation independence.

## Read before editing

Before changing protocol behavior, schemas, generated types, examples, or documentation, read `README.md`, the relevant `spec/1.0/` and `schemas/1.0/` files, the relevant data-model plan, `requirements/TRACEABILITY_MATRIX.md`, the current phase report, `SECURITY.md`, and the relevant ADR/RFC.

## Source-of-truth hierarchy

1. Approved specification prose and accepted RFCs.
2. JSON Schema 2020-12 source files.
3. Semantic rule registry.
4. Conformance fixtures.
5. Generated TypeScript and API documentation.
6. Examples and explanatory docs.

Generated artifacts must never be hand-edited. Change the schema, generator, or source and regenerate.

## Required behavior

- Keep the root manifest compact and use linked resources for large data.
- Use absolute stable identifiers and preserve course/offering/section separation.
- Preserve provenance, effective dates, conflicts, and source ownership.
- Keep signatures optional in v1 and delegation explicit, scoped, time-bounded, revocable, and non-transitive by default.
- Keep internationalization in the core and prefer role contacts over named staff.
- Never model student-level data or private operational data.
- Treat a valid signature or HTTPS response as integrity/transport evidence, not factual truth.
- Keep the protocol usable offline without runtime dependency on paperandslate.org.

## Privacy stop conditions

Stop and create a privacy finding instead of adding or publishing student names/IDs, grades, attendance, discipline, IEP/504/SEN/medical/safeguarding/accommodation records, private staff data, individual transport assignments, security-sensitive facility details, small-cell disclosures, credentials, secrets, internal endpoints, or unsafe rich text.

## Agent-generated data

Agents may create reviewable candidates only. Every extracted claim needs a source, locator, observation time, extraction method, confidence, review state, transformation, and privacy class. Distinguish facts, normalization, mappings, inference, and ambiguity. No automated path may publish without an explicit human review decision.

## Network safety

URL tools must allow only HTTP(S), block loopback/private/link-local/metadata/multicast targets, revalidate DNS and redirects, limit bytes/depth/time, reject userinfo, forward no ambient credentials, and sanitize remote content. Use controlled local fixtures for tests.

## Schema and release changes

For schema changes, update prose, semantic rules, generated types/docs, valid/invalid fixtures, Ecme data, compatibility/migration notes, changelog, and tests. Versioned schemas/specifications are immutable after release. Do not claim IANA registration, certification, adoption, legal approval, independent interoperability, or production readiness without recorded evidence.

## Required completion evidence

Report changed files, requirement IDs, decisions, commands/results, generated artifacts, compatibility, security/privacy impact, unresolved items, external blockers, and the next issue. Run focused tests during iteration and the full repository suite before completion.
