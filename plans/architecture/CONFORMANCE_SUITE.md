# Conformance Suite Architecture

## Components

- fixture repository;
- runner library;
- CLI command;
- browser-compatible subset;
- publisher endpoint runner;
- consumer behavior harness;
- machine-readable report schema;
- versioned profile definitions.

## Fixture organization

```text
fixtures/
  valid/
    core/
    school/
    district/
    modules/
    delegation/
    signatures/
  invalid/
    schema/
    semantic/
    privacy/
    security/
    delegation/
    signatures/
  http/
    redirects/
    caching/
    cors/
    malformed/
  migrations/
```

## One-rule fixtures

Most invalid fixtures should violate one rule, making failures diagnostic.

Adversarial fixtures may combine attacks and must be labeled.

## Golden results

Each fixture has expected:

- pass/fail;
- finding codes;
- profile applicability;
- severity;
- notes.

## Publisher tests

Given an origin:

- well-known discovery;
- HTTPS;
- GET/HEAD;
- redirects;
- content type;
- CORS;
- cache;
- root schema;
- resource fetch;
- graph validation;
- optional signature;
- privacy linter;
- freshness report.

## Consumer tests

Run a test server that presents:

- redirects;
- cross-origin delegation;
- stale caches;
- invalid content type;
- oversized responses;
- DNS/private IP simulations;
- duplicate JSON keys;
- broken signature;
- resource graph cycles.

Consumer implementation reports observed behavior.

## Determinism

Fixtures and expected output must be reproducible. Test time uses an injected clock.

## Report signing

Optional later. A conformance report may be signed by the runner, but must not imply factual data certification.

## Public test endpoint

A hosted endpoint may run safe tests against user-supplied public origins. It must:

- queue/rate limit;
- block private networks;
- limit resource graph size;
- identify its user agent;
- provide abuse contact;
- not retain bodies longer than necessary.
