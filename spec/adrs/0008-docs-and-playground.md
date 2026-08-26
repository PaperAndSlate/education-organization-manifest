# ADR-0008: Static Accessible Docs and Local Browser Playground

- Status: Accepted
- Date: 2026-08-25
- Related requirements: EOM-DOC-001

## Decision

Ship a static documentation site and a dependency-light browser playground in this repository. Local paste/file validation runs without upload; URL mode is a separate hardened service boundary and is not an unrestricted proxy.

## Consequences

Docs can be deployed independently and work without an account. Browser capabilities must be tested separately from Node tooling and must not retain submitted content by default.

## Validation

Static build, link check, keyboard/accessibility checks, and browser fixture tests.
