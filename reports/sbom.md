# SBOM and provenance evidence

`release/sbom.cdx.json` is a deterministic CycloneDX 1.5 component graph derived from the committed
workspace lockfile. It records package integrity hashes, dependency scope, and dependency edges for
the workspace and external packages. `release/build-provenance.json` records the source-date epoch,
lockfile digest, archive subject digest, and reproducible local build inputs.

These files support review and reproducibility. They do not claim signed provenance, trusted
publishing, a registry attestation, or an external security certification.
