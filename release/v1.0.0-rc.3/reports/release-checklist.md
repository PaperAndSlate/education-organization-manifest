# EOM Release Checklist

Status: RC3 local acceptance passed. RC1 and RC2 evidence remains preserved and superseded; no
stable publication or deployment is authorized.

## Local gates

- [x] clean frozen install from the release source revision;
- [x] formatting, real lint, typecheck, unit/integration tests, and coverage;
- [x] schema, vocabulary, module, ownership, fixture, and generated-drift checks;
- [x] all conformance profiles, publisher/consumer/generator/validator behavior, and Ecme High;
- [x] DNS-rebinding, redirect authority, parser, privacy, delegation, and signature regression tests;
- [x] browser build, Playwright, accessibility, CSP, upload, and XSS checks;
- [x] clean packed-package installation and runtime/type import smoke tests;
- [x] exact lockfile-derived SBOM, license/dependency/security checks, and action-pin checks;
- [x] deterministic dual-directory builds and reproducible release archives;
- [x] traceability check covering all 194 planning files and atomic requirements;
- [x] post-remediation formal Standard security scan with no unresolved findings;
- [x] RC3 release manifest, checksums, provenance, migration notes, and pack manifests bound to the
      exact clean source commit.

The executable `pnpm verify` gate is authoritative. The checks above are backed by the current
receipt, release manifest, and traceability check; report prose is not verification evidence.
`reports/verification/local-gates.json` is generated evidence bound to the clean source revision
selected by the release manifest; it is the only source-tree exception allowed while the receipt is
being recorded.

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
