# ADR-0002: JSON Schema Is Structural Source of Truth

- Status: Accepted
- Date: 2026-08-25
- Related requirements: EOM-MAN-001, EOM-VER-001

## Decision

Author normative structure in JSON Schema 2020-12. Generate TypeScript declarations and field documentation from those schemas. Implement graph and policy semantics in validator/linter code with stable rules.

## Alternatives considered

Hand-maintained TypeScript or a runtime-only model would drift from language-neutral consumers. A code-first schema generator would reverse the intended normative direction.

## Consequences

Schema release and generated-drift checks are mandatory. Semantic rules cannot be hidden in schema descriptions.

## Validation

Meta-schema checks, fixtures, generated output comparison, and semantic tests.
