# paperandslate.org integration asset

This page is the static integration copy for the paper&slate website. It can be linked from a
project page or developer portal without making the protocol depend on paperandslate.org at
runtime.

## Project card

**Educational Organization Manifest** is a proposed open standard for publishing trustworthy,
machine-readable information about schools and other educational organizations from their own web
domains.

Status: **working draft**. The proposed `educational-organization-manifest` well-known suffix is
not claimed as IANA-registered.

## Suggested links

- [Documentation site](../../apps/docs/src/index.html) — standalone static documentation and tools;
- [Publisher quickstart](../publisher-quickstart.md) — create a first local publication;
- [Consumer guide](../getting-started.md) — discover and validate an origin;
- [Ecme High example](../../examples/ecme-high/README.md) — fictional end-to-end publication;
- [Conformance guide](../conformance.md) — profile and evidence boundaries;
- [Governance](../governance/README.md) — proposals, review, and status language.

The links are repository-source references for the integration asset. A deployed website should
point them at its immutable documentation and release URLs and preserve redirects when URLs move.

## Safe copy

paper&slate stewards the specification and may provide documentation and convenience tools. The
publishing school, district, college, or training provider remains authoritative for the public
resources it serves from its own origin. Vendors may publish delegated resources only when the root
manifest explicitly describes that delegation.

Do not describe EOM as IANA-registered, certified, independently adopted, legally approved, or
production-ready until the corresponding external evidence is recorded. Do not send publication
content to the website merely to validate it: the standalone tools support local processing, and
any hosted URL auditor must be a separately constrained service with a published retention policy.
