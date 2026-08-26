# Release Checklist

## Status and authority

- [ ] Protocol version approved through governance.
- [ ] Proposed/registered well-known status verified on release date.
- [ ] Public copy uses accurate status language.
- [ ] No unsubstantiated certification/adoption claims.
- [ ] Change controller and maintainers identified.

## Specification and schemas

- [ ] Normative specification frozen for candidate.
- [ ] Schema `$id` values are immutable and reachable.
- [ ] Schema 2020-12 meta-validation passes.
- [ ] Semantic rule registry versioned.
- [ ] Generated types/docs match schemas.
- [ ] Examples validate.
- [ ] Invalid fixtures fail with expected codes.
- [ ] Module registry complete.
- [ ] Vocabularies/code-list versions recorded.

## Compatibility

- [ ] Semver classification reviewed.
- [ ] Compatibility matrix updated.
- [ ] Migration guide provided.
- [ ] Deprecations have replacement and timeline.
- [ ] Older supported fixtures tested.
- [ ] Extension behavior tested.
- [ ] External mapping versions recorded.

## Tooling

- [ ] Clean install succeeds.
- [ ] Build/typecheck/lint/test succeeds.
- [ ] Generator deterministic.
- [ ] Generated drift clean.
- [ ] CLI installation/smoke tests pass.
- [ ] Machine-readable report schemas validated.
- [ ] URL auditor passes SSRF tests.
- [ ] Validator size/performance limits tested.

## Security and privacy

- [ ] Threat model reviewed.
- [ ] Security audit completed.
- [ ] Privacy audit completed.
- [ ] Secret scan completed.
- [ ] Dependency vulnerability/license audit completed.
- [ ] Network fetch controls verified.
- [ ] Signature test vectors verified.
- [ ] Key/revocation docs checked.
- [ ] Staff/student/high-risk module fixtures reviewed.
- [ ] No sensitive source snapshots included.

## Documentation and accessibility

- [ ] Docs build.
- [ ] Link checker passes.
- [ ] Code examples execute.
- [ ] Quickstart tested from clean environment.
- [ ] Ecme walkthrough complete.
- [ ] Browser tools accessibility tested.
- [ ] Upload/retention notice accurate.
- [ ] Draft/registered status notice visible.
- [ ] paperandslate.org copy updated.

## Conformance and interoperability

- [ ] Core conformance profile passes.
- [ ] Publisher and consumer roles tested.
- [ ] Ecme High passes all selected modules.
- [ ] Delegation fixtures pass/fail as expected.
- [ ] Signature fixtures pass/fail as expected.
- [ ] Mapping loss reports reviewed.
- [ ] Independent interoperability evidence recorded, or status blocked.
- [ ] Pilot feedback triaged.

## Packaging and provenance

- [ ] Package versions aligned.
- [ ] Lockfile clean.
- [ ] Release commit/tag signed according to policy.
- [ ] Source archive created.
- [ ] Checksums created.
- [ ] SBOM created.
- [ ] Build provenance/attestation created.
- [ ] npm or other package publish dry run passed.
- [ ] Documentation artifacts archived.
- [ ] Release notes and changelog complete.

## Operations

- [ ] Schema/spec URLs monitored.
- [ ] Redirect/archival policy tested.
- [ ] Security contact reachable.
- [ ] Correction process reachable.
- [ ] Rollback plan tested.
- [ ] Release owner assigned.
- [ ] Post-release verification checklist scheduled.

## External gates

- [ ] IANA submission prepared.
- [ ] IANA decision recorded, or release status explicitly says pending.
- [ ] Media type/link relation decisions recorded.
- [ ] Independent pilot participants documented, or external blocker open.
- [ ] Legal/license review status accurately represented.
