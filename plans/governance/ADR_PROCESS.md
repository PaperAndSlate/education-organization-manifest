# Architecture Decision Records

## Purpose

ADRs record implementation architecture, not protocol governance.

Examples:

- pnpm/Turborepo choice;
- Ajv configuration;
- docs framework;
- canonical JSON library;
- URL-fetch isolation;
- package boundaries;
- release method.

## ADR template

- title;
- status;
- date;
- context;
- decision;
- alternatives;
- consequences;
- security/privacy;
- follow-up;
- supersedes/supersededBy.

## Rules

- one decision per ADR;
- immutable after accepted except status/links;
- supersede rather than rewrite;
- link related RFC;
- include dependency/version considerations without making transient versions the core decision.

## Numbering

`spec/adrs/0001-...md`

## Required initial ADRs

1. monorepo/package manager;
2. JSON Schema as source of truth;
3. JSON canonical wire format and YAML authoring;
4. root manifest plus linked modules;
5. absolute URI identity;
6. validator/linter separation;
7. deterministic generation;
8. docs/playground architecture;
9. optional signature profile;
10. source ownership versus publication delegation.
