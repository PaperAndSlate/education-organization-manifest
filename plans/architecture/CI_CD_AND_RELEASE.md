# CI/CD and Release

## Pull request CI

Jobs:

1. install with frozen lockfile;
2. format check;
3. lint;
4. type check;
5. schema meta-validation;
6. unit tests;
7. integration tests;
8. conformance fixtures;
9. generated drift;
10. deterministic build;
11. docs build/link check;
12. license/REUSE check;
13. secret scan;
14. dependency review;
15. CodeQL/static analysis;
16. package-size/API compatibility checks.

## Security practices

- pin Actions by commit;
- least-privilege permissions;
- no write token in untrusted PR jobs;
- isolated signing/release environment;
- OIDC trusted publishing for npm;
- SBOM and provenance;
- protected environments;
- no private keys in CI artifacts.

## Branching

- `main` always releasable;
- short-lived feature branches;
- release branches only when necessary;
- schema/spec changes require RFC/issue;
- branch protection and CODEOWNERS.

## Changesets

Use Changesets for package release intent. Specification release notes may be separate but linked.

## Artifact release

Publish:

- npm packages;
- schema archive;
- vocabulary archive;
- conformance fixtures;
- generated TypeScript docs;
- checksums;
- SBOM;
- provenance attestation;
- signed Git tag/release where available.

## Specification deployment

Versioned docs and schemas deploy atomically.

Never rewrite:

- `/spec/eom/1.0/`;
- `/schemas/eom/1.0/...`.

Draft URLs include date or draft number.

## Release channels

- canary/next;
- release candidate;
- stable.

No stable v1 before registration gate.

## Dependency updates

Automated PRs with:

- grouped low-risk updates;
- immediate security updates;
- tests;
- changelog review for major updates;
- no automatic merge for parser/crypto/network dependencies without review.

## Changelog

Track:

- added;
- changed;
- deprecated;
- removed;
- fixed;
- security;
- migration notes;
- spec/schema compatibility.

## Rollback

Package rollback uses new patch release/deprecation, not unpublishing where avoidable.

Docs deployment retains previous immutable version.

## Disaster recovery

- repository mirrors;
- release artifact backup;
- schema/spec static backup;
- signing key recovery policy;
- domain/DNS account recovery;
- maintainer succession.
