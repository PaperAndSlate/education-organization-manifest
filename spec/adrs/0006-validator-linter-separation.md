# ADR-0006: Validator and Linter Are Separate Layers

- Status: Accepted
- Date: 2026-08-25
- Related requirements: EOM-VAL-001, EOM-PRIV-001

## Decision

Structural/semantic conformance is returned by the validator. Quality, freshness, accessibility, privacy recommendations, and operational checks are returned by the linter, with non-overridable security/privacy blockers identified explicitly.

## Consequences

Valid shape is never confused with factual truth or publication quality. Tools can choose warning policy without weakening safety errors.

## Validation

Finding category and exit-code tests, stable error codes, and invalid fixture assertions.
