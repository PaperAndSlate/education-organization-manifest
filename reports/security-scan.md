# Security scan evidence

Status: post-remediation formal scan passed for the exact reviewed RC3 candidate. This is local
security evidence, not an external clearance or authorization to publish a stable release.

The deterministic repository security gate can be run with:

```powershell
pnpm verify:security
```

It checks private-key material, credential-shaped tokens, committed environment files, unsafe remote
installers, workflow permissions, and the browser network/XSS boundary. Intentional invalid privacy
fixtures remain test inputs and are not release data.

## Current post-remediation status

Formal post-remediation status: pass

- Scan ID: `f8f6779b-8e79-4816-ba42-78970b521815`
- Exact scanned revision: `8d013d9b61e6a3f3c2e16ec34af7beb7a23c2a38`
- Exact scanned tree: `ff865e8cb260e8318d87a9a4178f92b0727b1eb6`
- Coverage: complete repository review
- Reportable findings: 0
- Unresolved critical/high/medium/low findings: 0
- Canonical evidence: [`security-scan/scan-manifest.json`](security-scan/scan-manifest.json),
  [`security-scan/findings.json`](security-scan/findings.json), and
  [`security-scan/coverage.json`](security-scan/coverage.json)

The aggregate verification receipt repeats this scan ID, target commit, and target tree. The scan
identity is exact without pretending that a commit can include a report whose contents depend on
that same commit hash.

This local report does not claim an external penetration test, hosted CodeQL result, production
deployment review, IANA registration, legal approval, independent interoperability, or adoption.
