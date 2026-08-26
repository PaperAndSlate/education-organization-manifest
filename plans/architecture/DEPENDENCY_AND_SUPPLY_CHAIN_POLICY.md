# Dependency and Supply-Chain Policy

## Principles

- prefer standards and platform APIs;
- minimize dependencies in security-critical paths;
- use maintained packages with compatible licenses;
- pin versions through lockfile;
- review transitive risk;
- avoid install scripts unless necessary.

## Dependency review fields

For each direct runtime dependency document:

- purpose;
- alternatives considered;
- maintainer/activity;
- license;
- release cadence;
- known security history;
- Node/browser support;
- bundle impact;
- transitive count;
- replacement plan.

## High-risk categories

Require heightened review:

- YAML parsers;
- JSON canonicalization;
- JOSE/crypto;
- HTTP fetching;
- URL/DNS/IP classification;
- HTML/Markdown sanitization;
- glob/file traversal;
- archive handling.

## Release provenance

- npm trusted publishing/OIDC;
- package provenance;
- SBOM;
- signed Git tag;
- checksums;
- reproducible package contents;
- two-person approval for stable release.

## Package hygiene

- files allowlist;
- no tests/secrets/source evidence in npm tarball unless intended;
- package exports;
- engines;
- funding/repository metadata;
- license;
- security contact;
- sideEffects field where correct.

## Tooling

Evaluate current options at implementation time:

- CodeQL;
- OpenSSF Scorecard;
- OSV Scanner;
- npm audit as supplementary;
- dependency review action;
- secret scanning;
- Renovate/Dependabot;
- REUSE compliance.

Do not rely on one scanner as proof of security.
