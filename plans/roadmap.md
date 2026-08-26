# Roadmap

## Roadmap principles

- Stabilize discovery, authority, privacy, and identifiers before maximizing fields.
- Prove a minimal end-to-end publisher and consumer flow early.
- Treat schemas, prose, validator behavior, examples, and generated types as one release unit.
- Add modules behind capability discovery.
- Keep the school website/CMS and the foundation index in separate repositories.
- Do not make public production claims before registration and interoperability gates are met.

## Phase 0 — Foundation and research

Deliver:

- selected working name and suffix;
- repository charter;
- standards landscape;
- scope and non-goals;
- governance and licensing;
- threat model;
- data protection/publication policy;
- IANA registration strategy;
- architecture ADRs;
- requirement traceability matrix.

Exit criteria:

- no unresolved decision blocks the minimal manifest;
- all examples use reserved domains and fictional data;
- core terminology is defined.

## Phase 1 — Minimal protocol vertical slice

Deliver:

- root manifest schema;
- common envelope;
- organization profile schema;
- resource descriptor;
- capability declarations;
- absolute identifier rules;
- HTTPS/GET/HEAD/cache/CORS behavior;
- minimal school example;
- validator library;
- CLI commands: `validate`, `lint`, and `inspect`;
- valid and invalid fixtures.

Exit criteria:

- a manifest can be fetched, validated, and linked to one organization profile;
- structural and semantic failures are distinct;
- deterministic fixture output is proven.

## Phase 2 — Modular authoring and generation

Deliver:

- YAML authoring profile;
- generator configuration;
- modular source merge rules;
- source-vs-generated directory contract;
- deterministic normalization;
- resource indexes;
- build reports;
- CODEOWNERS example;
- ownership and review matrix;
- CLI commands: `init`, `build`, `check`, and `diff`.

Exit criteria:

- two clean builds are byte-identical;
- a department owner can change only owned source and generate the whole publication;
- generated drift fails CI.

## Phase 3 — School information modules

Deliver schemas, semantic rules, examples, and docs for:

- campuses;
- departments;
- staff and role contacts;
- courses;
- offerings and sections;
- programs and pathways;
- academic calendars;
- events;
- facilities and services;
- policies and documents;
- admissions and public enrollment information.

Exit criteria:

- Ecme High has a useful course catalog and annual public school profile;
- course definitions and offerings are demonstrably separate;
- all modules can be omitted independently.

## Phase 4 — Extended public modules

Deliver:

- sports;
- clubs;
- transportation;
- meals and menus;
- jobs;
- news;
- public aggregate statistics;
- API/service discovery references.

Exit criteria:

- Ecme High exercises every v1 module;
- privacy linter covers common accidental disclosures;
- large collections can be split without expanding the root manifest.

## Phase 5 — Provenance, conflicts, and agent workflow

Deliver:

- provenance schema;
- field-target mapping using JSON Pointer;
- evidence ledger;
- conflict representation;
- source precedence implementation;
- confidence and review-state model;
- extraction prompts;
- candidate workspace;
- pull-request generation workflow;
- stale-data auditing;
- privacy review reports.

Exit criteria:

- an agent can create a reviewed candidate from an approved set of sources;
- no candidate can publish without an explicit operator action;
- conflicting data is visible and traceable.

## Phase 6 — Delegation and optional signatures

Deliver:

- delegation model;
- cross-origin authorization rules;
- vendor-hosted example;
- key-set resource;
- JCS canonicalization;
- content digest;
- detached JWS signature profile;
- key rotation/revocation;
- signature test vectors;
- `sign` and `verify` CLI commands.

Exit criteria:

- clients can distinguish origin authority, source maintainer, and signer;
- revoked and out-of-scope signatures fail;
- unsigned v1 publishers remain valid.

## Phase 7 — Documentation, playground, and adoption tools

Deliver the public documentation site and tools:

### Core pages

- overview;
- why EOM exists;
- how discovery works;
- specification;
- schemas;
- module browser;
- publisher guide;
- consumer guide;
- vendor guide;
- privacy guide;
- governance;
- Ecme High example;
- migration and versioning.

### Interactive tools

- URL/file/paste validator;
- semantic linter;
- HTTP endpoint audit;
- manifest explorer;
- schema browser;
- starter manifest generator;
- YAML-to-canonical-JSON converter;
- course catalog preview;
- Schema.org preview;
- signature verifier;
- conformance report viewer;
- version diff and migration assistant;
- provenance/evidence viewer;
- module coverage report;
- code snippets for common frameworks.

Exit criteria:

- tools work without accounts for public data;
- browser fetch behavior and CORS limitations are clearly explained;
- all tools have accessible keyboard and screen-reader behavior;
- sensitive content warnings appear before uploads.

## Phase 8 — Registration and interoperability candidate

Deliver:

- stable draft specification;
- IANA registration request;
- media type decision;
- optional link-relation proposal decision;
- public review record;
- at least one publisher and one independent consumer interoperability test;
- conformance profiles;
- release candidate.

Exit criteria:

- provisional or permanent IANA registration accepted;
- interoperability report published;
- no unresolved critical security or privacy findings.

## Phase 9 — v1.0

Deliver:

- immutable v1.0 specification and schemas;
- reference packages;
- signed npm release provenance;
- conformance suite;
- changelog and migration policy;
- adoption kit;
- stable Ecme High demo;
- public announcement materials.

## Phase 10 — Foundation index and public API

Separate repository.

Planned capabilities:

- crawler/discovery submission;
- safe fetch and snapshot pipeline;
- source provenance and observation history;
- organization identity resolution;
- change detection;
- searchable school and course API;
- geographic indexing;
- stale-source alerts;
- conflict reporting;
- opt-out and correction workflow;
- API documentation and bulk dataset releases.

The index must never overwrite origin data without retaining the original claim and provenance.

## Phase 11 — School website and catalog platform

Separate repository.

Potential capabilities:

- CMS-like editing;
- role-based module ownership;
- website rendering;
- course catalog pages;
- printable PDF catalogs;
- course cards and embeds;
- Schema.org output;
- EOM generation;
- API output;
- import from existing school systems;
- approvals and scheduled publication;
- multilingual site generation.

## Deferred items

These are valid future work but should not delay v1 unless promoted through an RFC:

- mandatory signatures;
- JSON-LD/RDF canonical representation;
- official custom media type;
- official dedicated link relation;
- webhook/change-notification protocol;
- delta feeds and event streams;
- full historical archive protocol;
- higher-education-specific admissions and degree profiles;
- international qualification equivalence;
- comprehensive standards and subject taxonomies;
- live seat availability and enrollment transactions;
- GTFS import/export for transportation;
- nutrition database integrations;
- athletics league and score-feed adapters;
- job-board federation;
- GraphQL reference API;
- Swift, Kotlin, Python, Go, and Rust SDKs;
- browser extension for detecting EOM;
- automatic government-record matching;
- decentralized trust registries;
- verified credential publication;
- mandatory conformance certification;
- formal ISO, W3C, or IETF standardization beyond the well-known registration;
- course-content and lesson-document formats, which belong to a related but separate paper&slate project.

## Permanently out of scope

These are not merely deferred:

- private student records;
- grades and student-level attendance;
- IEP, 504, SEN, medical, safeguarding, and discipline data;
- private bus assignments;
- private employee records;
- authentication secrets;
- replacing SIS/LMS transactional standards.

## Main paperandslate.org placement

Recommended information architecture:

- `paperandslate.org/standards/eom` — project landing page;
- `paperandslate.org/spec/eom/1.0` — immutable specification;
- `paperandslate.org/schemas/eom/1.0/...` — immutable schemas;
- `paperandslate.org/tools/eom-validator` — validator;
- `paperandslate.org/examples/ecme-high` — interactive example;
- `paperandslate.org/governance/eom` — governance;
- short redirect: `paperandslate.org/eom`.

The main paper&slate homepage should include an “Open standards” or “Infrastructure” section that links to EOM alongside the future educational document format and public APIs.

## Suggested main-site copy

### Card

**Educational Organization Manifest**

Publish school information once. Make it understandable everywhere.

EOM is an open standard for placing authoritative, machine-readable school and educational-organization information on an organization's own website—from courses and calendars to departments, transport, meals, clubs, and public services.

Calls to action:

- Explore the standard
- Validate a manifest
- View Ecme High

### Project hero

**A machine-readable front door for every school.**

Educational information is scattered across websites, PDFs, vendor systems, and government databases. EOM gives schools and other educational organizations one open way to publish public information from their own domain, while keeping ownership and authority in their hands.

Primary call to action: **Read the specification**  
Secondary call to action: **Generate a starter manifest**

### Trust statement

EOM is open infrastructure stewarded by paper&slate. It does not require a paper&slate account, and it does not contain private student records.

## Website tool priority

### Launch with the first release candidate

1. validator;
2. endpoint checker;
3. manifest explorer;
4. starter generator;
5. Ecme High demo;
6. schema browser.

### Add before v1.0

7. YAML/JSON converter;
8. course catalog preview;
9. provenance viewer;
10. signature verifier;
11. conformance report;
12. Schema.org preview.

### Later

13. migration assistant;
14. source extraction wizard;
15. public index search;
16. school website generator;
17. code generator for multiple SDKs.
