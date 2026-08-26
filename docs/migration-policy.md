# Migration policy

EOM keeps the root manifest compact and treats versioned schemas and specifications as immutable.
Compatible additions are optional, namespaced, and documented with a migration note. A consumer
must ignore an unsupported optional module only when the profile permits that module to be absent;
it must not silently accept an invalid required field or unknown top-level root property.

Breaking changes require a new major protocol version, an RFC, updated conformance profiles, a
compatibility matrix, and an overlap period in which publishers can serve both versions. Stable
resources retain their IDs where the entity remains the same; a renamed or replaced resource gets a
new canonical URL only when its identity or semantics changed.

Package rollback uses a new patch release or deprecation notice. Previously published `/spec/eom/1.0/`
and `/schemas/eom/1.0/` content is never rewritten. See `release/MIGRATION_POLICY.md` for the
release-candidate operational checklist.
