# EOM Release Checklist

This checklist is the release-candidate evidence surface. The earlier completion claim has been
superseded by `reports/remediation-audit.md`. Local entries below reflect the bounded remediation
run on 2026-08-26; hosted CI and external protocol/governance gates remain separate.

## Local gates

- [pass] clean frozen install;
- [pass] formatting, real lint, typecheck, unit/integration tests;
- [pass] schema meta-validation and complete semantic fixtures;
- [pass] generated types/docs/browser bundles drift-free;
- [pass] deterministic builds and release archive regeneration;
- [pass] all role-specific conformance profiles and Ecme High;
- [pass] SSRF/DNS-rebinding/parser/privacy/signature tests;
- [pass] docs links and automated Chromium accessibility/security checks;
- [pass] license, dependency, secret, SBOM, and local provenance checks;
- [pass] immutable candidate artifacts, package dry runs, and migration notes.
- [pass] final formal Standard security workbench scan for committed RC2 revision `36c63a8` (zero findings).

## External gates

- [blocked-external] proposed suffix status rechecked on release date;
- [blocked-external] IANA submission/decision recorded accurately;
- [blocked-external] independent publisher/consumer interoperability evidence;
- [pending-external] legal/licensing review;
- [pending-external] public review and governance approval;
- [blocked-external] pilot/adoption evidence.

Until evidence exists, public copy must say working draft/proposed and the release report must include the owner, required evidence, and blocker.
