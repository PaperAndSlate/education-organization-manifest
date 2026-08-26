# Security Policy

EOM tooling handles untrusted JSON, YAML, URLs, redirects, documents, extensions, signatures, and agent-generated candidates. Report vulnerabilities privately through the security contact published by the deploying organization or by opening a security advisory in the repository when enabled. Do not include secrets or private school/student data in a public issue.

## Scope

In scope: validator bypasses, duplicate-key/parser issues, YAML resource exhaustion, SSRF, path traversal, unsafe archive or rich-text handling, signature/key confusion, delegation bypass, XSS in docs/playground, privacy leaks, CI and release supply-chain issues, and conformance-service abuse.

Out of scope as security reports by themselves: inaccurate school facts, stale optional data, classification disagreements, or missing optional modules. These belong in the correction and quality workflows unless a tool exposes protected data or creates a security impact.

Please include affected version/commit, reproduction, impact, safe proof, and suggested remediation. Maintainers will triage, reproduce, assign severity, patch, add a regression fixture, coordinate disclosure, and publish an advisory where appropriate. Response targets are goals, not guarantees.

Private keys, credentials, student records, personal staff information, and private source snapshots must never be submitted to the repository or issue tracker.
