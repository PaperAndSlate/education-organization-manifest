# Security scan evidence (superseded)

Status: historical formal scan for an earlier RC3 candidate; superseded by the current five-finding
pre-remediation audit and not valid evidence for the present working tree. This is local security
evidence, not an external clearance or authorization to publish a stable release.

The deterministic repository security gate can be run with:

```powershell
pnpm verify:security
```

It checks private-key material, credential-shaped tokens, committed environment files, unsafe remote
installers, workflow permissions, and the browser network/XSS boundary. Intentional invalid privacy
fixtures remain test inputs and are not release data.

## Historical candidate status

Formal status for the historical candidate: pass. It must not be used to close current findings.

- Scan ID: `f8f6779b-8e79-4816-ba42-78970b521815`
- Exact scanned revision: `8d013d9b61e6a3f3c2e16ec34af7beb7a23c2a38`
- Exact scanned tree: `20a50470f8d14b49972504c17b3e82c0f6478c68`
- Coverage: complete repository review
- Reportable findings: 0
- Unresolved critical/high/medium/low findings: 0
- Canonical evidence: [`security-scan/scan-manifest.json`](security-scan/scan-manifest.json),
  [`security-scan/findings.json`](security-scan/findings.json), and
  [`security-scan/coverage.json`](security-scan/coverage.json)

The historical aggregate receipt repeated this scan ID, target commit, and target tree. The scan
identity was exact for that candidate, but the present source tree has changed. A new scan must be
bound to the final remediation commit before verification can pass.

This local report does not claim an external penetration test, hosted CodeQL result, production
deployment review, IANA registration, legal approval, independent interoperability, or adoption.
