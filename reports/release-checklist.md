# EOM Release Checklist

Status: local RC3 release-evidence gates passed for the exact committed source revision below. This
is a working-draft release candidate; no stable publication, deployment, registration, or external
approval is claimed or authorized.

## Exact evidence identity

- Source commit: `c42b3df9e1670db80c41275eba1eba2058f22c13`
- Source tree: `3157225c89e3a66f6988bfe3f08c8929dc2b230d`
- Formal Standard scan: `d4abb4f5-1f16-4cdd-9122-d24528efbbdb` (zero findings, complete coverage)
- Aggregate receipt: `reports/verification/local-gates.json`
- Release manifest: `release/manifest.json`

## Local gates

- [x] clean frozen install from the final release source revision;
- [x] formatting, real lint, typecheck, unit/integration tests, and coverage;
- [x] schema, vocabulary, module, ownership, fixture, and generated-drift checks;
- [x] all conformance profiles, publisher/consumer/generator/validator behavior, and Ecme High;
- [x] DNS-rebinding, redirect authority, parser, privacy, delegation, and signature regression tests;
- [x] browser build, Playwright, accessibility, CSP, upload, and XSS checks;
- [x] clean packed-package installation and runtime/type import smoke tests;
- [x] exact lockfile-derived SBOM, license/dependency/security checks, and action-pin checks;
- [x] deterministic dual-directory builds and reproducible release archives;
- [x] traceability check covering all 194 planning files and 58 atomic requirements;
- [x] post-remediation formal Standard security scan with no unresolved findings;
- [x] RC3 release manifest, checksums, provenance, migration notes, and pack manifests bound to the
      exact clean source commit.

The authoritative `pnpm verify` receipt binds the source commit/tree, lockfile, formal scan, and
final traceability result. Release consistency and reproducibility checks passed with 269 manifest
artifacts and 270 byte-identical reproduced artifacts. Report prose alone is not verification
evidence.

## External gates

- [blocked-external] proposed suffix status rechecked on release date;
- [blocked-external] IANA submission/decision recorded accurately;
- [blocked-external] independent publisher/consumer interoperability evidence;
- [pending-external] legal/licensing review;
- [pending-external] public review and governance approval;
- [blocked-external] pilot/adoption evidence;
- [not-authorized] production deployment or stable publication.

Until external evidence exists, public copy must say working draft/proposed and the release report
must retain the owner, required evidence, and blocker in `reports/external-gates.md`. RC1 and RC2
evidence remains preserved and superseded; this checklist does not authorize push, tagging,
publication, deployment, or stable release.
