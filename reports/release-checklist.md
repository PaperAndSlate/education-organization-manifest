# EOM Release Checklist

This checklist is the release-candidate evidence surface. The earlier completion claim has been
superseded by `reports/remediation-audit.md`; items below remain open until the remediation gates
produce direct evidence.

## Local gates

- [open] clean frozen install;
- [open] formatting, real lint, typecheck, unit/integration tests;
- [open] schema meta-validation and complete semantic fixtures;
- [open] generated types/docs/browser bundles drift-free;
- [open] deterministic builds and release archive regeneration;
- [open] all role-specific conformance profiles and Ecme High;
- [open] SSRF/DNS-rebinding/parser/privacy/signature tests;
- [open] docs links and automated accessibility tests;
- [open] license, dependency, secret, SBOM, and provenance checks;
- [open] immutable candidate artifacts, package dry runs, and migration notes.

## External gates

- [blocked-external] proposed suffix status rechecked on release date;
- [blocked-external] IANA submission/decision recorded accurately;
- [blocked-external] independent publisher/consumer interoperability evidence;
- [pending-external] legal/licensing review;
- [pending-external] public review and governance approval;
- [blocked-external] pilot/adoption evidence;
- [open] no critical/high unresolved security or privacy finding after the formal audit; independent review remains pending.

Until evidence exists, public copy must say working draft/proposed and the release report must include the owner, required evidence, and blocker.
