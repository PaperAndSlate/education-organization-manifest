# ADR-0009: Optional Detached Signature Profile

- Status: Accepted
- Date: 2026-08-25
- Related requirements: EOM-SIG-001

## Decision

Implement signatures as an optional profile over canonical JSON using detached JWS/Ed25519 test vectors, key-set metadata, content digests, rotation, revocation, and delegation binding. Unsigned resources remain valid for core v1.

## Alternatives considered

Mandatory signatures would block small/static publishers and are not approved. Embedded signatures create recursive canonicalization problems.

## Consequences

Verification has multiple outcomes rather than one trust boolean. Private keys stay outside source/public output.

## Validation

RFC 8785/JWS vectors, wrong-key/changed-content/scope/expiry/revocation tests, and unsigned-core fixtures.
