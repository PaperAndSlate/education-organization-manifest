# ADR-0005: Absolute URI Entity Identity

- Status: Accepted
- Date: 2026-08-25
- Related requirements: EOM-ID-001

## Decision

Every reusable entity/resource uses an absolute stable URI. Canonical representation location is a separate field. External IDs remain namespaced identifier objects.

## Consequences

File moves and vendor changes do not silently create new identities. Renames require explicit migration/supersession.

## Validation

URI format vectors, duplicate/collision tests, and rename/migration fixtures.
