# Phase 8 — conformance and release evidence

> Historical phase report. Its local-slice evidence is retained, but completion claims and RC2
> evidence are superseded for current release acceptance by
> [`reports/remediation-audit.md`](remediation-audit.md) and the rebuilt traceability matrix. RC3
> must be accepted only from clean, source-revision-bound evidence.

## Completed locally

- Added the offline `@paperandslate/eom-testkit` with versioned publisher, consumer, generator,
  validator, module, and optional-signature profiles.
- Added `eom conformance` and the standalone conformance-runner package. Reports use the versioned
  conformance schema and retain check-level evidence identifiers.
- Ran the core publisher profile over the complete fictional Ecme High publication, including its
  identical discovery alias, with no network access.
- Added deterministic release-candidate packaging: immutable specification/schema copy, source
  archive, SHA-256 checksums, CycloneDX SBOM, and local reproducibility metadata.
- Added repository lint, security, license, dependency, release, and traceability gates.

## Explicit external blockers

IANA registration, legal review, independent publisher/consumer exchange, external certification,
production deployment, and stable governance approval cannot be completed from this checkout. The
prepared registration and pilot packets identify the owner and exact evidence required. Public
wording remains “working draft”; no external result is inferred from local tests.

## Evidence commands

```powershell
pnpm conformance
pnpm release:prepare
pnpm release:check
pnpm verify
```

Any earlier T013 receipt records historical command results only; it is not RC3 acceptance evidence.
