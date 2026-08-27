# Security Review: well-known

## Scope

Full post-remediation EOM repository Standard scan at clean source revision 6df650ee174903475c4b77570293da661aea0563 with tree dd712d83fbddcba4733758e2c6c70b5de01c8e28.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_7c22d80eb592711a4a29f0237589139f73e10edfd120e36f9c6ca5a99a48f88d
- Revision: 6df650ee174903475c4b77570293da661aea0563
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: local Windows parent source audit; independent baseline worker was unavailable after bounded wait and shutdown
- Artifacts reviewed: All 1396 files in the clean source revision, TypeScript packages, CLI, tests, schemas, examples, browser app, workflows, scripts, reports, and release tooling

Limitations and exclusions:
- Hosted Linux and macOS execution, CodeQL service analysis, dependency-review service analysis, and external interoperability were not available in this local scan.
- The independent baseline worker did not return within the bounded continuation window; parent-only source review and executable local gates provide the recorded review basis.
- The scan does not constitute IANA registration, legal review, governance approval, pilot/adoption evidence, deployment approval, or stable publication authorization.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | complete |
| Validation mode | repository-wide Standard |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Repository-wide EOM security review covering untrusted remote manifests and resources, authoring and generated publication content, detached signatures and delegated authority, parser and filesystem resource limits, browser rendering, package/release supply chain, CI workflows, and traceability evidence.

### Assets

- Published manifests, linked resources, schemas, vocabularies, signatures, and provenance
- Developer and consumer filesystem contents and generated publication roots
- Verifier decisions, reports, and conformance results
- Package and release integrity, CI credentials, and workflow execution
- Privacy-sensitive educational organization information

### Trust Boundaries

- Remote HTTP(S) content to local fetch, validation, cache, and report code
- Untrusted authoring input to generator, validator, browser, and documentation surfaces
- Detached signature material and delegated authority to verification decisions
- Repository source and dependencies to package, archive, SBOM, provenance, and CI outputs
- Generated evidence and release claims to reviewers and release consumers

### Attacker Capabilities

- Control or alter remote manifest/resource responses, redirects, DNS answers, and cache contents
- Supply malformed JSON/YAML, oversized or deeply nested inputs, unsafe paths, links, archives, and browser content
- Provide invalid, replayed, scope-mismatched, or cryptographically misleading delegation/signature records
- Submit pull requests or dependency changes that execute within repository tooling and workflows

### Security Objectives

- Prevent SSRF, DNS rebinding, unauthorized redirects, unbounded resource consumption, and unsafe filesystem replacement
- Fail closed on signature, authority, lifetime, subject, key-scope, and canonicalization mismatches
- Keep generated packages and evidence deterministic, source-bound, reviewable, and free of ambient credentials
- Prevent XSS, unsafe rich text, privacy leakage, and workflow privilege escalation
- Ensure reports cannot overstate executable evidence or external approval

### Assumptions

- External registration, legal/governance approval, independent interoperability, pilots, deployment, and stable publication are not asserted by this local scan.
- Hosted Linux and macOS execution, CodeQL service analysis, dependency-review service analysis, and external interoperability remain hosted or external evidence.
- Node's DEP0169 warning observed in package smoke tests is emitted by Corepack pnpm 10.6.0 authentication handling, not first-party code.

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| HTTP, DNS, redirects, and cache | not recorded | No issue found | No additional canonical notes were recorded. |
| Parsers and resource bounds | not recorded | No issue found | No additional canonical notes were recorded. |
| Authority and delegation scope | not recorded | No issue found | No additional canonical notes were recorded. |
| Detached signatures and key binding | not recorded | No issue found | No additional canonical notes were recorded. |
| Generator filesystem and atomic output | not recorded | No issue found | No additional canonical notes were recorded. |
| Validator, linter, and CLI | not recorded | No issue found | No additional canonical notes were recorded. |
| Browser and playground | not recorded | No issue found | No additional canonical notes were recorded. |
| Packages and dependency boundary | not recorded | No issue found | No additional canonical notes were recorded. |
| CI and GitHub Actions | not recorded | No issue found | No additional canonical notes were recorded. |
| Release, archives, SBOM, and provenance | not recorded | No issue found | No additional canonical notes were recorded. |
| Traceability and evidence writers | not recorded | No issue found | No additional canonical notes were recorded. |
| Privacy, documentation, examples, and conformance | not recorded | No issue found | No additional canonical notes were recorded. |
