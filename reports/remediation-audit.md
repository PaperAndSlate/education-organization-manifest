# EOM v1 Remediation Audit

Status: HISTORICAL / SUPERSEDED for current acceptance after hosted-validation-readiness source
changes. The local RC3 remediation and release-evidence results below remain immutable evidence for
the exact revision identified below; they do not cover later source or workflow changes.

RC3 remains a working-draft release candidate: it has not been published, deployed, registered, or
approved as a stable release.

## Exact evidence identity

- Source commit: `c42b3df9e1670db80c41275eba1eba2058f22c13`
- Source tree: `3157225c89e3a66f6988bfe3f08c8929dc2b230d`
- Formal Standard scan: `d4abb4f5-1f16-4cdd-9122-d24528efbbdb`
- Aggregate receipt: `reports/verification/local-gates.json`
- RC3 release manifest: `release/manifest.json`
- Planning traceability: `194` manifest files and `58` atomic requirements

The formal scan targeted the exact clean source commit and recorded complete coverage with zero
reportable findings and zero unresolved findings at every severity. Its canonical artifacts are
preserved under [`security-scan/`](security-scan/), with the project projection at
[`security-scan.json`](security-scan.json). The aggregate receipt repeats the same source commit,
source tree, lockfile binding, and scan identity.

## Remediation scope and local evidence

The implementation addresses package-boundary safety, generator ownership and partial-build modes,
DNS-bound transport, final-URL delegation authority, finite delegation lifetimes and key scopes,
versioned signature lifetime binding, CLI behavior, browser-safe validation, conformance evidence,
194-file traceability, release reproducibility, and truthful status reporting. A release-tooling
fix for isolated reproducibility output roots and a traceability fix for the final gate's
self-referential evidence requirement were also applied, tested, committed, and included in the
final scan.

The authoritative aggregate gate passed all configured local checks, including build, typecheck,
185 tests, coverage, browser/Playwright, lint, policy/security, package packing and clean installs,
conformance, deterministic builds, examples, documentation, release checks, reproducibility, and
traceability. The RC3 packet contains the generated manifest, checksums, provenance, SBOM, package
manifest, archives, current scan evidence, receipt, and traceability outputs.

RC1 and RC2 artifacts and reports remain preserved as immutable historical evidence and are marked
superseded for current acceptance. Pre-remediation and earlier candidate scans likewise remain
historical; none are used as current acceptance evidence.

## External gates intentionally retained

IANA registration, independent publisher/consumer interoperability, legal review, governance or
public approval, production deployment, stable publication, and adoption/certification remain
explicitly blocked, pending, or not authorized. They require named external owners and evidence in
[`external-gates.md`](external-gates.md); no local report claims those gates complete.

## Remaining limitations

- This local run was performed on Windows. Linux and macOS CI execution, hosted CodeQL/dependency
  review, external interoperability, legal/governance review, registration, deployment, and
  production adoption were not available and remain external gates.
- The Standard scan recorded that an independent baseline worker was unavailable because the
  desktop thread worker limit was reached; parent-thread review and executable gates are the
  recorded basis for this local scan.
