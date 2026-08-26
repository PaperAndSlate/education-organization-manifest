# EOM Release Checklist

This checklist is the release-candidate evidence surface. Local items are backed by the T013
completion run and release artifacts; external items remain explicitly blocked or pending.

## Local gates

- [x] clean frozen install;
- [x] formatting, lint, typecheck, unit/integration tests;
- [x] schema meta-validation and semantic fixtures;
- [x] generated types/docs drift-free;
- [x] deterministic builds;
- [x] conformance profiles and Ecme High;
- [x] SSRF/parser/privacy/signature tests;
- [x] docs links/accessibility;
- [x] license, dependency, secret, SBOM, and provenance checks;
- [x] immutable spec/schema artifacts and migration notes.

## External gates

- [blocked-external] proposed suffix status rechecked on release date;
- [blocked-external] IANA submission/decision recorded accurately;
- [blocked-external] independent publisher/consumer interoperability evidence;
- [pending-external] legal/licensing review;
- [pending-external] public review and governance approval;
- [blocked-external] pilot/adoption evidence;
- [x] no critical/high unresolved security or privacy finding in the local evidence set; independent review remains pending.

Until evidence exists, public copy must say working draft/proposed and the release report must include the owner, required evidence, and blocker.
