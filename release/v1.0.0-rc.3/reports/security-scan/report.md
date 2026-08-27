# Security Review: well-known

## Scope

Authoritative Standard scan over the complete repository at the exact clean committed source revision.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_7c22d80eb592711a4a29f0237589139f73e10edfd120e36f9c6ca5a99a48f88d
- Revision: c42b3df9e1670db80c41275eba1eba2058f22c13
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: not recorded
- Artifacts reviewed: packages/core/src/fetch.ts, packages/core/src/json.ts, packages/core/src/ids.ts, packages/authority/src/index.ts, packages/signatures/src/index.ts, packages/validator/src/engine.ts, packages/validator/src/inputs.ts, packages/validator/src/semantic.ts, packages/generator/src/index.ts, packages/cli/src/index.ts, apps/playground/src/browser-engine.js, apps/playground/src/app.js, scripts/generate-release-artifacts.ts, scripts/check-release-reproducibility.ts, scripts/check-release.ts, scripts/record-verification.ts, .github/workflows
- Scan context: Focused post-remediation review of transport and cache binding, strict input handling, delegation and final-URL authority, signatures, generator output ownership, isolated release reproducibility roots, archive traversal, package boundaries, browser inputs, CI, and release evidence.

Limitations and exclusions:
- Independent baseline worker was unavailable because the desktop thread worker limit was reached; parent-thread source review and executable gates provide the recorded review basis.
- Linux, macOS, and external CI execution are not available in this local Windows session.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | complete |
| Validation mode | not recorded |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Whole-repository post-remediation review of public EOM authoring, validation, retrieval, authority, signing, browser, packaging, release archives, reproducibility, and evidence paths.

### Assets

- Public EOM publication integrity
- Delegation and final-URL authorization
- Detached signature authenticity and lifetime
- Generator output and release archive integrity
- Release provenance, traceability, and package boundaries

### Trust Boundaries

- Untrusted local authoring files to generator
- Untrusted network DNS/HTTP responses to validator
- Root manifest declarations to delegated resource fetches
- Detached signature/key-set inputs to verification
- Browser uploads and same-origin validation responses
- Committed source revision to generated release evidence

### Attacker Capabilities

- Supply malformed or adversarial JSON/YAML
- Control or race DNS answers and HTTP redirects
- Provide unauthorized delegated origins or scope metadata
- Mutate signature lifetime, key, and sidecar metadata
- Supply polluted runtime objects or workspace dependency links
- Attempt unsafe output paths, symlinks, stale markers, temporary roots, or release archive traversal

### Security Objectives

- Fail closed on malformed, oversized, cyclic, or ambiguous inputs
- Bind connections to validated addresses and revalidate redirects and cache hits
- Enforce delegation origin/path/type/id/subject/time/revocation/key scope
- Cryptographically bind signature metadata and expiry
- Prevent destructive or cross-project generated-output replacement and archive traversal
- Keep release evidence tied to an exact committed source tree and lockfile

### Assumptions

- The scan target is the exact clean committed source revision named by the scan context.
- Historical candidate and pre-remediation reports are evidence only.
- External registration, pilot, legal/governance, deployment, and stable-publication gates are not local security findings.

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| DNS-pinned HTTP retrieval and cache | not recorded | No issue found | Validated addresses are bound to connections; redirects and cache hits revalidate transport policy. |
| Strict JSON and resource limits | not recorded | No issue found | Duplicate keys, depth, node, byte, cycle, sparse-array, and non-JSON checks are covered. |
| Delegation and final-URL authority | not recorded | No issue found | Observed final URL, descriptor, scope, subject, time, revocation, and key allowlist checks are shared. |
| Detached signature metadata and cryptographic verification | not recorded | No issue found | RC3 structured protected metadata and sidecar lifetime binding are fail-closed. |
| Validator structural and semantic input boundary | not recorded | No issue found | Runtime and graph inputs are bounded and normalized before schema and semantic processing. |
| Generator source/output ownership and atomic replacement | not recorded | No issue found | Approved roots, markers, mode selectors, dependency closure, symlink checks, locks, journals, and rollback reviewed. |
| Release archive traversal and reproducibility | not recorded | No issue found | Excluded dependency trees are pruned before traversal; isolated temporary output roots are trusted only after safe-root validation. |
| CLI path, graph, and dry-run boundaries | not recorded | No issue found | CLI paths and report writes use bounded and symlink-aware operations. |
| Browser engine, uploads, URL service, CSP/XSS | not recorded | No issue found | Browser JSON/YAML is bounded and normalized; report output uses textContent; service requests are same-origin HTTPS-bound. |
| Package exports and clean tarball installation | not recorded | No issue found | Exports target dist and clean package runtime/type smoke checks passed. |
| Traceability and aggregate verification evidence | not recorded | No issue found | Evidence records require formal zero-finding scan, exact source-tree agreement, and an authoritative self-check. |
| CI, security policy, and dependency controls | not recorded | No issue found | Action pins, policy/security checks, lint, dependency audit, and license checks passed locally where available. |
