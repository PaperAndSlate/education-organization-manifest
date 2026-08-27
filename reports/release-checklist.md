# EOM Release Checklist

Status: RC3 local acceptance is superseded and release preparation is blocked. The working tree
contains uncommitted remediation changes, and the existing receipt/release packet does not bind to
this source revision. RC1 and RC2 evidence remains preserved as historical evidence; no stable
publication or deployment is authorized.

## Local gates

- [ ] clean frozen install from the final release source revision;
- [ ] formatting, real lint, typecheck, unit/integration tests, and coverage;
- [ ] schema, vocabulary, module, ownership, fixture, and generated-drift checks;
- [ ] all conformance profiles, publisher/consumer/generator/validator behavior, and Ecme High;
- [ ] DNS-rebinding, redirect authority, parser, privacy, delegation, and signature regression tests;
- [ ] browser build, Playwright, accessibility, CSP, upload, and XSS checks;
- [ ] clean packed-package installation and runtime/type import smoke tests;
- [ ] exact lockfile-derived SBOM, license/dependency/security checks, and action-pin checks;
- [ ] deterministic dual-directory builds and reproducible release archives;
- [ ] traceability check covering all 194 planning files and atomic requirements;
- [ ] post-remediation formal Standard security scan with no unresolved findings;
- [ ] RC3 release manifest, checksums, provenance, migration notes, and pack manifests bound to the
      exact clean source commit.

The prior receipt and release packet are historical evidence only. A new `pnpm verify` receipt is
authoritative only when its source commit/tree, lockfile, formal scan, and final traceability check
all describe the same clean revision; report prose is not verification evidence.

## External gates

- [blocked-external] proposed suffix status rechecked on release date;
- [blocked-external] IANA submission/decision recorded accurately;
- [blocked-external] independent publisher/consumer interoperability evidence;
- [pending-external] legal/licensing review;
- [pending-external] public review and governance approval;
- [blocked-external] pilot/adoption evidence;
- [not-authorized] production deployment or stable publication.

Until external evidence exists, public copy must say working draft/proposed and the release report
must retain the owner, required evidence, and blocker in `reports/external-gates.md`.
