# Security Review: well-known

## Scope

Standard prompt-only security review of the complete committed RC3 candidate after remediation.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_7c22d80eb592711a4a29f0237589139f73e10edfd120e36f9c6ca5a99a48f88d
- Revision: eabcab722ddc09d96b0af0cf04c8e837d51ee7a1
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: Local deterministic build, test, package, release, and security checks completed for the committed candidate.
- Artifacts reviewed: Committed source revision eabcab722ddc09d96b0af0cf04c8e837d51ee7a1, release/v1.0.0-rc.3
- Scan context: Complete EOM v1.0.0-rc.3 candidate in the paperandslate/well-known repository.

Limitations and exclusions:

- External registration, legal/governance approval, independent pilots, deployment, and production adoption remain explicitly blocked.
- Excluded IANA registration: External governance action; no local evidence can authorize completion.
- Excluded independent interoperability: Requires external implementers and independently controlled test evidence.
- Excluded legal governance approval: Requires external approvers.
- Excluded deployment production adoption: Operational/external gate outside this repository.

### Scan Summary

| Field               | Value                       |
| ------------------- | --------------------------- |
| Scan outcome        | completed                   |
| Reportable findings | 0                           |
| Severity mix        | none                        |
| Confidence mix      | none                        |
| Coverage            | complete                    |
| Validation mode     | standard prompt-only review |

Canonical artifacts are preserved beside this report: `scan-manifest.json`, `findings.json`, and `coverage.json`.

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed surfaces

The formal review covered transport and resource limits; root/delegated authority; detached signatures;
safe generator replacement; publication graph validation; compiled package boundaries; CLI, browser,
adapter, and conformance behavior; planning-pack traceability; release evidence; CI and dependency
policy; and privacy, retention, accessibility, and documentation surfaces.

This report does not claim an external penetration test, hosted CodeQL result, production deployment
review, IANA registration, legal approval, independent interoperability, or adoption.
