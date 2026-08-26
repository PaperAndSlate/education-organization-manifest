# EOM vocabulary snapshots

The versioned snapshots under `1.0/` are public, fictional working-draft
artifacts. They cover the planned v1 categories and deliberately preserve open
and extensible values rather than pretending to define a universal education
taxonomy.

Each snapshot records its source, source version, retrieval time, license,
transformation/update mechanism, compatible EOM versions, multilingual term
labels where appropriate, provenance-oriented mappings, and a `contentDigest`.
The digest is `sha256:` followed by the SHA-256 hash of the canonical JSON
snapshot with `contentDigest` removed. Run `pnpm generate:vocabulary-digests`
after an intentional snapshot change, then `pnpm vocabulary:check`.
