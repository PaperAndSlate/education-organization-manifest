# Phases and Milestones

## Execution model

Codex should work in phase branches or clearly bounded commits. Each phase ends with:

- completed traceability rows;
- ADR/RFC updates;
- tests and command log;
- generated-drift check;
- security/privacy impact note;
- phase report;
- backlog reconciliation.

A phase may expose blocked external gates, but it may not mark them complete without evidence.

## Phase 0 — Research, charter, and governance

### Deliverables

- project charter and scope;
- neutral naming decision;
- registration collision recheck;
- standards landscape;
- terminology;
- licenses;
- governance/RFC/ADR processes;
- security/privacy policy;
- architecture ADRs;
- traceability matrix;
- repository issue taxonomy.

### Acceptance

- all user-approved decisions represented;
- non-goals are explicit;
- no real school/person data in fixtures;
- proposed suffix status is accurate;
- maintainers can explain how a breaking change is approved.

## Phase 1 — Minimal manifest

### Deliverables

- common schema package;
- manifest schema;
- organization descriptor/profile;
- resources and capabilities;
- HTTP/discovery spec;
- validator/linter core;
- minimal fixture;
- CLI vertical slice;
- docs quickstart.

### Acceptance scenario

A consumer fetches the exact well-known path, validates the manifest, identifies one school, follows its organization profile, and reports conformance failures with actionable paths.

## Phase 2 — Authoring and deterministic generation

### Deliverables

- YAML authoring schemas;
- generator config;
- modular ownership layout;
- resolver/normalizer;
- canonical serializer;
- build report/digests;
- source maps;
- `init/build/check/diff`;
- CI generated-drift gate.

### Acceptance scenario

Two department owners modify separate source modules. A clean build merges them according to explicit rules and produces byte-identical canonical output without either owner editing generated files.

## Phase 3 — Core school modules

### Deliverables

- campuses;
- departments;
- staff/contacts;
- courses;
- offerings/sections;
- programs/pathways;
- calendar/events;
- facilities/services/policies;
- admissions.

### Acceptance scenario

Ecme High can generate a useful school and course-catalog website data set while the root manifest stays compact.

## Phase 4 — Extended modules

### Deliverables

- sports;
- clubs;
- transportation;
- meals;
- jobs;
- news;
- statistics;
- API/service discovery.

### Acceptance scenario

Every module can be independently omitted, hosted, delegated, validated, and displayed. Privacy-class-specific lints work.

## Phase 5 — Provenance and agent workflows

### Deliverables

- source inventory;
- evidence ledger;
- claim model;
- field-level provenance;
- conflict records;
- review states;
- staleness;
- candidate workspace;
- versioned prompts;
- PR report;
- no-direct-publication gate.

### Acceptance scenario

An approved website/document fixture becomes a candidate course catalog. Every value is traceable, conflicts survive, and a reviewer must approve before generation to release source.

## Phase 6 — Delegation and signatures

### Deliverables

- authority evaluator;
- delegation schema;
- vendor/district fixtures;
- revocation/expiry;
- canonicalization/digests;
- optional JWS/Ed25519 profile;
- sign/verify;
- test vectors.

### Acceptance scenario

Ecme High authorizes a meal vendor and its district transport feed. A consumer accepts only the explicit scopes. Optional signed resources verify; unsigned resources remain valid.

## Phase 7 — Documentation and browser tools

### Deliverables

- complete docs;
- validator;
- explorer;
- starter generator;
- schema browser;
- converters/previews;
- accessibility and security tests;
- paperandslate.org integration assets.

### Acceptance scenario

A school administrator with no prior EOM knowledge can generate a minimal candidate, validate it, understand errors, and follow deployment guidance without an account.

## Phase 8 — Conformance and release candidate

### Deliverables

- profiles;
- conformance runner;
- reports;
- complete fixtures;
- interoperability guides;
- IANA submission package;
- pilot guides;
- release candidate packages;
- SBOM/provenance.

### Acceptance scenario

The Ecme fixture and at least one independent test implementation can be evaluated consistently. External gates remain explicitly pending until completed.

## Phase 9 — v1.0 release gate

Requires:

- IANA status appropriate for public production recommendation;
- completed public review;
- no critical/high security/privacy findings;
- specification/schema/example consistency;
- immutable release artifacts;
- release and migration policy;
- documented interoperability evidence.

## Phase 10+ — Separate products

- foundation index and open API;
- school website/catalog platform;
- managed publisher service;
- broader standards/qualification registries;
- education knowledge graph.

These are not part of the protocol v1 implementation repository except for interfaces, sample integrations, and roadmap documents.
