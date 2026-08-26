# Reproducibility evidence

Generator output uses fixed observation time, sorted source paths, canonical JSON, and content
digests. The release tool uses a sorted source file set, normalized tar metadata, and
`SOURCE_DATE_EPOCH` (default `0`).

```powershell
pnpm verify:determinism
pnpm release:prepare
pnpm release:check
```

The release manifest records the archive and immutable-candidate hashes. The provenance file is
explicitly local unsigned metadata; it is not an external attestation.
