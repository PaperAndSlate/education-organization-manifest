# Threat Model

## Assets

- integrity of organization-published information;
- authority/delegation relationships;
- signing keys;
- privacy of non-public source/evidence data;
- validator/crawler infrastructure;
- package/release supply chain;
- conformance reputation;
- foundation index accuracy.

## Trust boundaries

- school origin;
- district origin;
- vendor origin;
- public internet;
- authoring repository;
- CI/CD;
- signing service;
- paper&slate docs/tools;
- future crawler/index;
- agent extraction environment.

## Threat actors

- attacker controlling a source file;
- compromised school website account;
- malicious vendor;
- malicious URL supplied to validator;
- dependency compromise;
- insider publishing private data;
- crawler abuse;
- confused consumer;
- stale or abandoned domain owner;
- AI agent hallucination or prompt injection.

## Major threats and mitigations

### Well-known takeover

Threat: attacker gains write access to hidden `.well-known` location.

Mitigation:

- normal deployment ownership;
- branch protection;
- publication monitoring;
- optional signatures;
- endpoint change alerts;
- security guidance from RFC 8615.

### SSRF

Threat: URL validator fetches cloud metadata/private systems.

Mitigation:

- IP range blocks;
- re-resolve after redirects;
- public DNS only;
- port/scheme allowlist;
- no ambient credentials;
- time/size limits;
- isolated fetch worker.

### Parser attacks

Threat: malicious JSON/YAML, deep nesting, aliases, duplicate keys, regex DoS.

Mitigation:

- strict parsers;
- bounded depth/size;
- duplicate rejection;
- safe YAML mode;
- fuzzing;
- dependency audits.

### Signature confusion

Threat: valid signature by unauthorized key or wrong resource.

Mitigation:

- protected context;
- content type;
- key ID;
- subject/resource binding;
- delegation scope;
- algorithm allowlist;
- test vectors;
- no ambiguous boolean result.

### Cross-origin authority confusion

Threat: root links to vendor and consumer treats vendor as school.

Mitigation:

- preserve root origin;
- explicit publisher/subject/authority fields;
- delegation validation;
- UI trust labels.

### Privacy leakage

Threat: student/staff/security data published.

Mitigation:

- prohibited schema fields;
- linter;
- review matrix;
- agent privacy scan;
- role contacts;
- expiry;
- correction workflow.

### Prompt injection

Threat: school webpage tells extraction agent to ignore rules or leak secrets.

Mitigation:

- treat source text as untrusted evidence only;
- no source-instructed tool use;
- fixed extraction schema;
- network/tool allowlists;
- evidence review;
- no direct publish.

### Supply-chain compromise

Mitigation:

- lockfile;
- minimal dependencies;
- provenance;
- OIDC npm publish;
- code review;
- dependency scanning;
- CodeQL;
- SBOM;
- signed releases;
- pin GitHub Actions by commit.

### Domain expiration

Threat: closed school domain acquired by another party.

Mitigation:

- lifecycle/effective dates;
- government identifier cross-check;
- index observation history;
- stale warnings;
- successor relationships;
- optional signatures do not solve expired-domain ownership alone.

### Resource explosion

Threat: manifest links huge graph.

Mitigation:

- depth/resource/byte limits;
- cycle detection;
- explicit consumer budgets;
- index/chunk metadata.

### XSS in documentation/catalog preview

Mitigation:

- no raw HTML by default;
- sanitize Markdown;
- CSP;
- escape text;
- safe URL protocols;
- isolated preview.

## Security tests

- fuzz JSON/YAML;
- malicious redirects/DNS;
- zip/decompression bombs if archives added;
- oversized language maps;
- path traversal in generator;
- symlink escape;
- poisoned cache;
- signature algorithm confusion;
- Unicode confusables in IDs/domain display;
- secret scanning.

## Residual risk

A valid, signed resource can still be intentionally false or unsafe. EOM establishes publication provenance and integrity, not institutional endorsement or factual truth.
