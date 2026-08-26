# EOM 1.0 Release and compatibility policy

EOM 1.0 is distributed as a versioned working-draft release candidate until the external
registration, review, and interoperability gates are closed. A release artifact identifies its
protocol status, source-date epoch, checksums, SBOM, and local provenance metadata. Local
provenance is reproducibility evidence; it is not a signed build attestation or a certification of
the published facts.

The specification and schema URLs under `/spec/eom/1.0/` and `/schemas/eom/1.0/` are immutable
versioned targets. Corrections use a new compatible package or protocol version and a migration
note. A stable v1 release must not rewrite an immutable artifact or claim that the proposed
`educational-organization-manifest` suffix is registered without a recorded registry decision.

## Release channels

- `canary` is for development and may change without compatibility guarantees;
- `release-candidate` is frozen for review and carries explicit external blockers;
- `stable` requires governance approval, completed security/privacy review, registration status,
  and independent interoperability evidence.

Package and schema compatibility are evaluated separately. A package patch may fix tooling without
changing the wire format. A schema or normative behavior change requires an RFC/ADR, updated
fixtures, migration guidance, and a new immutable version when it is breaking.

## Provenance and rollback

Source archives are reproducible with `SOURCE_DATE_EPOCH`, and checksums cover the immutable
specification/schema copy, archive, SBOM, and provenance metadata. The local provenance file states
the source lockfile digest and build inputs. Signing, trusted publishing, protected release
environments, and an external attestation are deployment responsibilities and are not simulated in
this repository.

Rollback uses a new package patch or a documented deprecation and retains the previous immutable
documentation/schema artifact. It does not delete or rewrite a previously published version.
