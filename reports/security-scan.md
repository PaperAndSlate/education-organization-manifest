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

- Scan ID: `75beb51b-8b00-4da6-8ca0-867474d910c5`
- Exact scanned revision: `eabcab722ddc09d96b0af0cf04c8e837d51ee7a1`
- Exact scanned tree: `1e9822b90ba64d6f98800136555c78bdfdd9d235`
- Coverage: complete repository review
- Reportable findings: 0
- Unresolved critical/high/medium/low findings: 0
- Canonical evidence: [`security-scan/scan-manifest.json`](security-scan/scan-manifest.json),
  [`security-scan/findings.json`](security-scan/findings.json), and
  [`security-scan/coverage.json`](security-scan/coverage.json)

The aggregate verification receipt records the later clean source revision that carries this
durable evidence and repeats the scan ID, target commit, and target tree. The scan identity is
therefore exact without pretending that a commit can include a report whose contents depend on
that same commit hash.

This local report does not claim an external penetration test, hosted CodeQL result, production
deployment review, IANA registration, legal approval, independent interoperability, or adoption.
