# Historical Security Review: well-known

## Scope

Historical Standard prompt-only security review of an earlier RC3 candidate after conformance,
security, and evidence-binding remediation. This artifact is preserved for audit history and is
superseded for current acceptance.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_7c22d80eb592711a4a29f0237589139f73e10edfd120e36f9c6ca5a99a48f88d
- Revision: 8d013d9b61e6a3f3c2e16ec34af7beb7a23c2a38
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: Local deterministic build, test, package, release, and security checks completed for the historical candidate.
- Artifacts reviewed: Historical source revision 8d013d9b61e6a3f3c2e16ec34af7beb7a23c2a38, release/v1.0.0-rc.3
- Scan context: Historical EOM v1.0.0-rc.3 candidate in the paperandslate/well-known repository.

Limitations and exclusions:
- External registration, legal/governance approval, independent pilots, deployment, and production adoption remain explicitly blocked.
- Excluded IANA registration: External governance action; no local evidence can authorize completion.
- Excluded independent interoperability: Requires external implementers and independently controlled test evidence.
- Excluded legal governance approval: Requires external approvers.
- Excluded deployment production adoption: Operational/external gate outside this repository.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | complete |
| Validation mode | standard prompt-only review |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

The public publication graph, generator, validator, signing flow, package distribution, and release evidence must remain safe when inputs, DNS, redirects, cache contents, signatures, manifests, and generated output are attacker-influenced.

### Assets

- Published EOM manifests and resource graphs
- Delegation and signature authority decisions
- Generated publication and release artifacts
- Consumer validator and browser-facing behavior
- Traceability and release provenance

### Trust Boundaries

- Authoring filesystem to generator
- DNS/network transport to fetched publication graph
- Declared resource metadata to observed final URL
- Delegated authority to signed resource
- Workspace source revision to packed/released artifacts
- Browser or CLI user input to validator and report output

### Attacker Capabilities

- Control or vary DNS answers and redirect destinations.
- Provide malformed, oversized, cyclic, stale, or symlinked local inputs and cache entries.
- Attempt unsafe partial output replacement or marker reuse.
- Modify delegation, subject, key, timestamp, signature, vocabulary, and manifest metadata.
- Exploit package boundaries, browser inputs, or stale completion evidence.

### Security Objectives

- Prevent SSRF, DNS rebinding, unauthorized graph traversal, and scope bypass.
- Fail closed on malformed, expired, revoked, mismatched, or unbounded inputs.
- Prevent destructive or cross-project generated-output replacement.
- Bind signatures, release evidence, and completion claims to verifiable inputs and revisions.

### Assumptions

- TLS certificate hostname verification remains required for HTTPS transport.
- Cryptographic verification uses trusted configured public keys.
- External governance and operational gates are not represented as locally completed.

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| DNS-bound HTTPS transport, redirects, cache, and resource budgets | not recorded | No issue found | No additional canonical notes were recorded. |
| Root/delegated authority, scope, subject, time, revocation, and key allowlists | not recorded | No issue found | No additional canonical notes were recorded. |
| Detached signatures, protected lifetime metadata, and verified key binding | not recorded | No issue found | No additional canonical notes were recorded. |
| Safe full/partial/organization/changed-files generation and atomic replacement | not recorded | No issue found | No additional canonical notes were recorded. |
| Publication graph validation, final-URL authority, and bounded local inputs | not recorded | No issue found | No additional canonical notes were recorded. |
| Compiled package exports, packed installation, and package-local assets | not recorded | No issue found | No additional canonical notes were recorded. |
| CLI, browser engine, adapter, and conformance behavior | not recorded | No issue found | No additional canonical notes were recorded. |
| 194-file planning-pack mapping, executable evidence, and completion-claim controls | not recorded | No issue found | No additional canonical notes were recorded. |
| RC3 release artifacts, provenance, reproducibility, and clean-tree enforcement | not recorded | No issue found | No additional canonical notes were recorded. |
| CI action pinning, dependency/security policy, licensing, and quality gates | not recorded | No issue found | No additional canonical notes were recorded. |
| Privacy, retention, accessibility, and documentation surfaces | not recorded | No issue found | No additional canonical notes were recorded. |
