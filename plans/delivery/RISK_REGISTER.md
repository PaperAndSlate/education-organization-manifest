# Risk Register

Scores should be reviewed each phase. Suggested probability/impact scale: 1–5.

| ID | Risk | P | I | Mitigation | Trigger/owner |
|---|---|---:|---:|---|---|
| R-001 | Proposed suffix collides or is rejected | 2 | 5 | Recheck registry; prepare alternate names; obtain expert feedback before v1 | Registration owner |
| R-002 | Root manifest grows into a data dump | 3 | 4 | Size budget; linked modules; conformance lint | Spec lead |
| R-003 | Protocol duplicates established standards poorly | 3 | 4 | Standards landscape; mappings; external review | Interop lead |
| R-004 | U.S.-specific assumptions leak into core | 4 | 4 | International types; non-U.S. fixtures before v1 | Schema lead |
| R-005 | Student/private data is accidentally published | 3 | 5 | Prohibition, allowlists, privacy linter, review gate, quarantine | Privacy lead |
| R-006 | Named staff data becomes stale or excessive | 4 | 4 | Opt-in fields, expiry/review metadata, role contacts | Module owner |
| R-007 | Transport/facility fields expose safety-sensitive detail | 2 | 5 | security review class, coarse/public-only schemas | Security lead |
| R-008 | Small-cell statistics enable re-identification | 3 | 5 | suppression rules, minimum counts, provenance | Statistics owner |
| R-009 | Vendor delegation creates false authority | 3 | 5 | explicit scope, non-transitive default, expiry/revocation | Protocol/security |
| R-010 | Signatures are mistaken for factual verification | 3 | 4 | docs, API naming, trust model | Security/docs |
| R-011 | Key rotation/revocation breaks consumers | 3 | 4 | overlap windows, test fixtures, cache rules | Security lead |
| R-012 | AI extraction fabricates or overwrites facts | 4 | 5 | evidence ledger, confidence, no publish, human approval | Agent workflow owner |
| R-013 | Source disappearance causes destructive deletions | 4 | 4 | absence ≠ deletion rule; stale state | Data steward |
| R-014 | Copyright/terms prevent source reuse | 3 | 4 | source inventory, license review, structured facts only | Legal/licensing |
| R-015 | IDs change with names/file paths | 3 | 5 | ID policy, rename tests, migration tools | Schema/tooling |
| R-016 | Course and offering concepts collapse | 4 | 4 | separate schemas, lint rules, examples | Course module owner |
| R-017 | Prerequisite logic is misrepresented | 3 | 4 | structured boolean model; semantic tests | Course owner |
| R-018 | Extension ecosystem fragments the standard | 3 | 4 | namespace rules, registry, promotion process | Governance |
| R-019 | Schema and prose drift | 4 | 5 | traceability, generated docs, executable examples | Release owner |
| R-020 | Generator output is non-deterministic | 3 | 4 | canonical order, fixed time injection, reproducibility tests | Tooling |
| R-021 | YAML/parser resource exhaustion | 2 | 5 | safe parser settings, limits, fuzz tests | Security/tooling |
| R-022 | Hosted URL validator enables SSRF | 3 | 5 | isolated fetch service and strict network controls | Security |
| R-023 | Validator stores uploaded private data | 2 | 5 | local processing, no retention default, audit | Tools/privacy |
| R-024 | Remote rich text causes XSS | 3 | 5 | sanitized subset/no HTML; CSP; tests | Docs/tools |
| R-025 | Foundation service becomes accidental dependency | 3 | 4 | self-hosted packages, immutable specs, no runtime lookup | Architecture |
| R-026 | paperandslate.org cannot maintain immutable URLs | 2 | 5 | archival/redirect commitment, mirrors, release archives | Foundation ops |
| R-027 | Adoption too complex for small schools | 4 | 4 | minimal profile, generator, static deployment, docs | Product/adoption |
| R-028 | Too many optional fields reduce consistency | 4 | 3 | profiles, vocabularies, lint/recommendations | Spec lead |
| R-029 | Too many required fields block adoption | 3 | 4 | minimal core, module optionality | Spec lead |
| R-030 | Foundation index misrepresents origin data | 3 | 5 | snapshots/provenance/conflict/correction/opt-out | Future index |
| R-031 | Crawling violates source constraints | 2 | 4 | approved sources, identification, rate limits, legal review | Future index |
| R-032 | External mapping claims certification | 2 | 4 | precise language and disclaimers | Interop/docs |
| R-033 | Package supply-chain compromise | 2 | 5 | minimal deps, pinned CI, SBOM, provenance, scanning | Maintainers |
| R-034 | Maintainer loss stalls specification | 3 | 4 | succession, multiple maintainers, documented releases | Governance |
| R-035 | Conformance mark used misleadingly | 3 | 3 | mark policy, report URL, role/profile/version | Governance |
| R-036 | Real-looking fixture is mistaken for real school | 3 | 3 | `.example`, banners, fictional IDs, no real address | Docs/test |
| R-037 | Localization structure is too burdensome | 3 | 3 | default-language shorthand with canonical normalization | I18n lead |
| R-038 | Translations are presented as authoritative | 3 | 4 | language provenance/reviewer state | Content owners |
| R-039 | Event/menu/live feeds overwhelm static model | 3 | 3 | collection paging, freshness, generated adapters | Module owners |
| R-040 | Registration delays block v1 naming | 3 | 4 | draft namespace/status, alternate plan, do not overclaim | Registration owner |

## Risk acceptance

A risk may be accepted only with:

- owner;
- rationale;
- expiry/review date;
- affected requirements;
- compensating controls;
- public disclosure when material to adopters.

Critical privacy/security risks cannot be accepted merely to meet a release date.
