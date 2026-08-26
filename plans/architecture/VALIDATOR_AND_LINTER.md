# Validator and Linter

## Separation

### Validator

Determines syntactic, structural, and semantic conformance.

### Linter

Reports quality, privacy, freshness, interoperability, and operational concerns.

A warning must not be mislabeled as a schema error.

## Input modes

- local file;
- directory/publication graph;
- stdin;
- URL;
- well-known origin;
- source authoring project;
- generated output.

## Validation layers

1. transport and content type;
2. JSON syntax/duplicate keys;
3. schema validation;
4. semantic resource validation;
5. graph/reference validation;
6. authority/delegation;
7. integrity/signature;
8. conformance profile.

## Safe URL fetching

Default protections:

- HTTPS only;
- public DNS/IP ranges only;
- DNS rebinding checks;
- block localhost, link-local, private, multicast, metadata endpoints;
- port allowlist 443 and optional 80 redirect;
- max redirects;
- max response bytes;
- decompression limit;
- connection/read timeout;
- content type checks;
- no cookies;
- no auth forwarding;
- no ambient proxy unless explicitly configured;
- user agent identifying validator;
- cache and rate limits.

## Finding format

```json
{
  "code": "EOM-COURSE-0012",
  "severity": "error",
  "category": "semantic",
  "message": "Course offering references an unknown course.",
  "resource": "https://...",
  "pointer": "/data/offerings/2/course",
  "related": [],
  "help": "https://paperandslate.org/docs/eom/findings/EOM-COURSE-0012"
}
```

## Stable codes

Finding codes are public API. Do not reuse codes for new meanings.

Categories:

- HTTP;
- JSON;
- schema;
- identity;
- reference;
- language;
- lifecycle;
- provenance;
- delegation;
- signature;
- privacy;
- security;
- accessibility;
- freshness;
- interoperability;
- quality.

## Linter examples

- no expiry on staff directory;
- course lacks description;
- prerequisite only free text;
- conflicting languages;
- non-HTTPS link;
- broken human-readable alternate;
- stale job;
- meal allergen data without update time;
- exact staff schedule;
- missing correction contact;
- missing source license;
- identifier scheme not registered locally;
- module capability declared without resource.

## Configuration

Allow severity overrides for organization policy, except non-overridable security/privacy errors.

Config should be versioned and included in reports.

## Output formats

- human terminal;
- JSON;
- SARIF for GitHub code scanning;
- JUnit for CI;
- HTML report;
- conformance JSON.

## Exit codes

Define stable exit codes:

- 0 success/no blocking findings;
- 1 validation findings;
- 2 configuration/usage;
- 3 network/transport;
- 4 internal tool error;
- 5 signature/security policy failure.

## Offline mode

All local validation must work offline with bundled schemas/vocabularies. Remote `$ref` resolution disabled by default.
