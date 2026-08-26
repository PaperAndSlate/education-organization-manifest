# ADR-0007: Deterministic Generation

- Status: Accepted
- Date: 2026-08-25
- Related requirements: EOM-GEN-001, EOM-REL-001

## Decision

Normalize source ordering, IDs, arrays, dates, property serialization, and output paths. Content-dependent canonical output excludes wall-clock build metadata; reports may carry injected observation/build times.

## Consequences

Generated drift is reviewable and reproducibility is testable across directories/platforms. Real source observations must be explicit inputs.

## Validation

Repeated clean builds and reversed filesystem enumeration produce identical canonical bytes.
