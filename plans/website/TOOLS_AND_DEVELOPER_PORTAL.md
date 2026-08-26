# Tools and Developer Portal

## Goal

Make EOM understandable and testable before asking schools or vendors to adopt it.

## Tool priority

### Tier 1 — Required for first public draft

#### Validator

Inputs:

- URL;
- uploaded JSON/YAML;
- pasted content;
- local CLI.

Checks:

- HTTP discovery;
- structural schema;
- semantic rules;
- cross-resource references;
- freshness;
- privacy warnings;
- conformance profile.

Output should use stable error codes, JSON Pointers, severity, explanation, and suggested remediation.

#### Manifest explorer

Render:

- publisher and scope;
- organizations;
- capabilities;
- resources;
- delegation chain;
- signatures;
- provenance;
- module coverage;
- links to raw resources.

#### Starter generator

Questionnaire for:

- organization type;
- name/domain;
- languages;
- campus;
- role contact;
- initial modules;
- hosting approach.

Output:

- YAML source starter;
- canonical JSON preview;
- deployment instructions;
- no account required.

#### Schema browser

For every field:

- definition;
- required/optional;
- data type;
- examples;
- semantic rules;
- privacy class;
- introduced/deprecated version;
- mappings.

### Tier 2 — Adoption tools

- YAML/JSON converter;
- course catalog preview;
- module coverage report;
- HTTP endpoint audit;
- Schema.org JSON-LD preview;
- code snippets;
- GitHub starter-repository generator;
- deployment recipes for static hosts, common web servers, and framework routes;
- stale-data report;
- provenance viewer.

### Tier 3 — Advanced tools

- signature verifier;
- conformance runner/report viewer;
- version diff;
- migration assistant;
- delegation visualizer;
- evidence-led import assistant;
- website/catalog theme preview;
- crosswalk explorer;
- index submission/status tool.

## URL validator architecture

Browser-only URL validation is insufficient because CORS may block a legitimate endpoint. Recommended design:

```text
browser
  → public validation API
      → constrained safe fetch service
          → schema/semantic engine
```

The fetch service must implement the threat model:

- HTTP(S) only;
- destination allow/deny checks;
- DNS rebinding protection;
- redirect revalidation;
- private/link-local/loopback/metadata blocking;
- request and response limits;
- decompression limits;
- timeout;
- no cookies/auth;
- no script execution;
- response media-type enforcement;
- audit log without content retention by default.

## Privacy and retention notice

For paste/upload modes:

- process locally in the browser when technically practical;
- do not retain content by default;
- state what leaves the device;
- do not send content to analytics;
- warn users not to upload private student information;
- provide a clear deletion/retention policy for server-side validation.

## Documentation information architecture

```text
Overview
  Why EOM
  How it works
  Status and roadmap

Publish
  Quickstart
  Authoring YAML
  Generate JSON
  Host the endpoint
  Ownership
  Delegation
  Privacy
  Signatures

Consume
  Discovery
  Validation
  Caching
  Version negotiation
  Provenance
  Error handling

Reference
  Root manifest
  Common types
  Modules
  Vocabularies
  Schemas
  Semantic rules
  Conformance

Integrate
  School websites
  Vendors
  Districts
  Schema.org
  CEDS / Ed-Fi
  1EdTech
  Examples

Project
  Governance
  RFCs / ADRs
  Security
  Changelog
  GitHub
```

## Tool UX principles

- Show the first actionable error, then the complete report.
- Distinguish errors from recommendations.
- Never imply that schema-valid data is factually verified.
- Explain authority and delegation visually.
- Let users copy a minimal reproduction.
- Offer machine-readable reports.
- Avoid forcing account creation.
- Meet accessibility requirements.
- Make draft/registered protocol status conspicuous.
