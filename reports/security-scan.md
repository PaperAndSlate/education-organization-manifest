# Security scan evidence

Status: post-remediation formal scan pending. This file is intentionally not a zero-finding or
release-clearance claim.

The deterministic repository security gate can be run with:

```powershell
pnpm verify:security
```

It checks private-key material, credential-shaped tokens, committed environment files, unsafe remote
installers, workflow permissions, and the browser network/XSS boundary. Intentional invalid privacy
fixtures remain test inputs and are not release data.

## Current post-remediation status

Formal post-remediation status: pending

The post-remediation Standard scan must run against the final clean RC3 source commit after all
local tests pass. The result must identify the exact commit, coverage, scan ID, every finding and
its disposition, and must contain no unresolved critical, high, medium, low, or plan-conformance
security defect before RC3 is considered locally ready.

This local report does not claim an external penetration test, hosted CodeQL result, production
deployment review, IANA registration, legal approval, independent interoperability, or adoption.
