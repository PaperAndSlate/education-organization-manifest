# Security scan evidence

Status: pass. This report is the project projection of the sealed Standard scan artifacts for the
RC3 remediation source revision. It is local security evidence, not an external clearance or
authorization to publish a stable release.

## Exact target

- Scan ID: `d4abb4f5-1f16-4cdd-9122-d24528efbbdb`
- Exact scanned revision: `c42b3df9e1670db80c41275eba1eba2058f22c13`
- Exact scanned tree: `3157225c89e3a66f6988bfe3f08c8929dc2b230d`
- Target ID: `target_sha256_7c22d80eb592711a4a29f0237589139f73e10edfd120e36f9c6ca5a99a48f88d`
- Scan mode: repository Standard scan
- Completion: `2026-08-27T17:40:50.918461Z`
- Coverage: complete repository review
- Reportable findings: 0
- Unresolved critical/high/medium/low findings: 0

Canonical artifacts: [`security-scan/scan-manifest.json`](security-scan/scan-manifest.json),
[`security-scan/findings.json`](security-scan/findings.json),
[`security-scan/coverage.json`](security-scan/coverage.json), and
[`security-scan/report.md`](security-scan/report.md).

The scan reviewed the RC3 transport, strict-input, delegation, signature, validator, generator,
browser, package, archive, reproducibility, CI, and release-evidence boundaries. The sealed scan
found no reportable security findings and recorded complete coverage.

Limitations:

- An independent baseline worker was unavailable because the desktop thread worker limit was
  reached; parent-thread source review and executable gates provide the recorded review basis.
- Linux, macOS, and external CI execution are not available in this local Windows session.

This local report does not claim an external penetration test, hosted CodeQL result, production
deployment review, IANA registration, legal or governance approval, independent interoperability,
or adoption. Those gates remain explicitly blocked or pending.
