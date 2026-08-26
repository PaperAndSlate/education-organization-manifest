# Educational Organization Manifest 1.0

Status: working draft. This document is the normative entry point for the EOM 1.0 implementation in this repository. It is not an IANA registration, certification, or claim that published institutional data is true.

## Scope

EOM defines public discovery and publication of institutional information for educational organizations. An HTTPS origin publishes a compact root manifest at:

```text
/.well-known/educational-organization-manifest
```

The root identifies its publisher and scope, represented organizations, capabilities, linked resources, delegation, version, and optional integrity metadata. Rich information is published in independently validatable modules.

## Normative source of truth

JSON Schema 2020-12 under `schemas/1.0/` defines structural validity. This specification and the versioned semantic rule registry define cross-field, graph, authority, privacy, freshness, and integrity behavior. Canonical wire resources are UTF-8 JSON. YAML is an authoring input and is never itself an EOM wire resource or signing input.

## Core requirements

An implementation claiming EOM 1.0 Core Publisher conformance MUST:

1. publish a structurally valid manifest and an organization profile or organization index;
2. use absolute stable IDs and declare publisher, scope, protocol version, subject organization, capabilities, and resources;
3. serve public resources over HTTPS with the discovery and media behavior in [protocol](protocol.md);
4. reject unknown top-level properties except the namespaced `extensions` object;
5. omit prohibited private data and never treat validation as factual verification;
6. preserve declared language, effective period, provenance, and authority information;
7. make optional modules independently omittable and independently reportable.

## Profiles and modules

Profiles add testable requirements without making every module mandatory. The school profile is the first-release emphasis; the type system supports districts, colleges, universities, training providers, authorities, and other organizations. Module schemas and registry records are versioned independently within protocol compatibility rules.

## Status wording

Use “proposed well-known URI suffix,” “working draft,” and “tested against EOM 1.0 [profile]” until external registration, public review, and interoperability evidence are actually recorded. A conformance result concerns protocol behavior, not school quality, legal compliance, accreditation, or truth of claims.
