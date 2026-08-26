# EOM release evidence

This directory contains release-candidate evidence, not a claim of stable publication. Run
`pnpm release:prepare` to regenerate deterministic artifacts with `SOURCE_DATE_EPOCH` (default
`0`), then `pnpm release:check` and `pnpm verify:release-reproducibility` to verify every recorded
checksum and byte-identical regeneration. Preparation requires a clean committed source tree.

The `v1.0.0-rc.1/` directory and its archive are preserved as immutable historical evidence. The
`v1.0.0-rc.2/` directory and archive are also preserved and superseded by the current `v1.0.0-rc.3/`
candidate. RC3 includes the specification, schemas,
mappings, versioned vocabularies, conformance fixtures, and their checksummed candidate copy. The
source, specification, schema, vocabulary, conformance, and documentation archives, checksums,
CycloneDX SBOM, and local build-provenance metadata are generated from the checkout. Provenance is
bound to the source commit but is intentionally marked as unsigned local metadata; it must not be
presented as an external attestation.

RC2 signatures and delegation records without `validUntil` are incompatible with RC3 validation.
Migrate them by re-signing resources and adding a finite delegation interval; do not weaken RC3
verification to accept legacy metadata.

The proposed `educational-organization-manifest` suffix is not claimed as IANA-registered. No
independent publisher/consumer pilot, legal approval, external certification, or production
deployment is claimed. The prepared packets and exact evidence needed to close those gates are in
`registration/`, `pilot/`, and `external-gates.md`.
