# EOM release evidence

This directory contains release-candidate evidence, not a claim of stable publication. Run
`pnpm release:prepare` to regenerate deterministic artifacts with `SOURCE_DATE_EPOCH` (default
`0`), then `pnpm release:check` to verify every recorded checksum.

The `v1.0.0-rc.1/` directory is the immutable candidate copy of the EOM 1.0 specification and
schemas. The source archive, checksums, CycloneDX SBOM, and local build-provenance metadata are
generated from the checkout. The provenance file is intentionally marked as unsigned local metadata;
it must not be presented as an external attestation.

The proposed `educational-organization-manifest` suffix is not claimed as IANA-registered. No
independent publisher/consumer pilot, legal approval, external certification, or production
deployment is claimed. The prepared packets and exact evidence needed to close those gates are in
`registration/`, `pilot/`, and `external-gates.md`.
