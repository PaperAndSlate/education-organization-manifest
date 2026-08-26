# ADR-0004: Compact Root with Linked Modules

- Status: Accepted
- Date: 2026-08-25
- Related requirements: EOM-MAN-001, EOM-RES-001

## Decision

The well-known root contains identity, scope, capabilities, resource descriptors, delegation, versioning, and optional integrity metadata. Collections are linked as independent module resources and indexes.

## Consequences

Small publishers can start with one profile; large districts avoid a multi-megabyte root. Consumers handle per-module failure independently.

## Validation

Root size lint, omission-combination fixtures, resource graph tests, and compact minimal example.
