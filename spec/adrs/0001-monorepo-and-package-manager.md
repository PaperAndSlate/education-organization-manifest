# ADR-0001: pnpm TypeScript Monorepo

- Status: Accepted
- Date: 2026-08-25
- Related requirements: EOM-GOV-001, EOM-REL-001

## Context

The reference implementation needs separately consumable schema, core, validator, linter, generator, signature, CLI, testkit, and adapter packages while keeping one reproducible source tree.

## Decision

Use a pnpm workspace with strict ESM-first TypeScript. Package boundaries follow the dependency direction in `plans/architecture/MONOREPO_ARCHITECTURE.md`; applications consume public package APIs.

## Alternatives considered

Separate repositories would improve isolation but slow coordinated schema/fixture changes. A single package would simplify setup but encourage hidden coupling.

## Consequences

Workspace installation and lockfile are shared; packages remain independently buildable and publishable. Node 24.17.0 and pnpm 10.6.0 are pinned for this implementation.

## Validation

Workspace install, package-boundary tests, typecheck, and frozen-lockfile CI.
