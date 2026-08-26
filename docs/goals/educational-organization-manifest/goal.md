# Educational Organization Manifest Repository

## Objective

Build the complete paper&slate Educational Organization Manifest (EOM) open-source standards repository described by `plans/MASTER_CODEX_GOAL_PROMPT.txt` and its planning pack, including the v1 protocol, schemas, generated types, deterministic generator, validator/linter, CLI, optional integrity/signature package, conformance suite, documentation/playground, Ecme High example, governance, interoperability, agentic workflow, CI/release assets, and explicit packaging of externally blocked registration or pilot work.

## Original Request

`/goal follow the prompt in MASTER_CODEX_GOAL_PROMPT.txt until this entire project is complete`

The controlling document is `plans/MASTER_CODEX_GOAL_PROMPT.txt`. Its planning pack is an approved existing plan and must be read, indexed, validated, and implemented phase by phase.

## Intake Summary

- Input shape: `existing_plan`
- Audience: protocol maintainers, educational organizations, data publishers, and machine-readable education-data consumers
- Authority: `requested`
- Proof type: `artifact`
- Completion proof: the repository contains every implementable v1 deliverable named in the master prompt and planning pack; traceability maps requirements to implementation and tests; focused and full local verification gates pass; generated artifacts are drift-free; and externally unavailable registration or pilot actions have complete submission/guide/issue packages with explicit blocked status.
- Goal oracle: the final PM/Judge audit over the planning pack, traceability matrix, phase reports, repository artifacts, conformance fixtures, generated-drift checks, and the complete local verification suite.
- Likely misfire: producing a polished protocol scaffold or documentation set while leaving schemas, generator behavior, safety enforcement, conformance coverage, generated artifacts, or release gates incomplete.
- Blind spots considered: the planning pack may contain conflicts or stale assumptions; the current directory has no source repository; no production deployment or IANA approval may be claimed; SSRF and privacy boundaries must be enforced in executable code; external providers, pilots, and independent registration remain evidence-gated; generated files must never be hand-edited; and all unrelated user changes must be preserved if they appear later.
- Existing plan facts: follow the master prompt; read every planning file before code changes; honor the priority order `01_CONFIRMED_DECISIONS.md`, specifications, architecture, data-model, delivery, then other guidance; implement in `delivery/PHASES_AND_MILESTONES.md` order; create traceability, phase reports, ADRs/RFCs, governance, tests, examples, adapters, and release materials; keep the root manifest compact; exclude student-level and other private/sensitive data; use HTTPS root authority, explicit non-transitive delegation, optional v1 signatures, internationalization, provenance/conflict preservation, and immutable versioned URLs.

## Goal Oracle

The oracle for this goal is:

`A final repository audit can trace each implementable master-prompt and phase-acceptance requirement to current source, schema, documentation, fixture, or test files; the declared local verification command passes; generated-drift checks pass; all conformance and safety fixtures behave as specified; and any external gate that cannot be completed from this workspace is represented by a complete submission/pilot/issue package and explicit blocked status rather than a false completion claim.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Continuous execution of the full repository: read and index the approved planning pack, establish the traceability and governance baseline, implement the protocol and schema vertical slices, complete all required modules and safety/ownership/provenance behavior, finish tooling/docs/example/interoperability/release assets, and run phase and final audits until the full local outcome is complete. External approval or independent pilot participation will be packaged and recorded as blocked when it cannot be performed from this repository.

## Non-Negotiable Constraints

- The planning pack is the product brief; when documents conflict, use the priority order in the master prompt.
- Never model or publish student-level data, grades, individual attendance, IEP/504/SEN/medical/safeguarding records, discipline, private schedules, private transportation assignments, secrets, credentials, or internal-only endpoints.
- The HTTPS education origin is root authority; source ownership and publication authority are separate; delegation is explicit, scoped, cross-origin capable, and non-transitive by default.
- JSON Schema 2020-12 is the structural source of truth; generated TypeScript and published JSON must be produced by tooling and not hand-edited.
- Use an active LTS Node.js version pinned at implementation time, pnpm workspace conventions, and strict TypeScript.
- Preserve conflicts with field/object/resource provenance and the approved precedence model rather than silently overwriting data.
- Keep the root manifest compact and put rich data in linked modules.
- Do not claim IANA registration, production deployment, independent pilots, provider acceptance, or credentials that are not evidenced in this workspace.
- Use controlled local fixtures for networked URL-fetch tests and build SSRF protections into validator/crawler utilities.
- Preserve unrelated user changes and do not perform destructive cleanup, live/paid calls, deployment, merge, or push without explicit authorization.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated. Do not stop after one verified Worker package while the broader repository outcome still has safe local follow-up work. Advance through all phases, record blocked external gates truthfully, and finish only after the machine-checkable goal stop gate passes.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny. Prefer coherent vertical slices: protocol core, module/schema family, generator/validation toolchain, safety and ownership, developer experience, and release/conformance. Review at phase, risk, rejected-verification, ambiguity, and final-completion boundaries rather than after every repeated file.

## Board Health

The PM owns board health. If the board looks stale or inconsistent, run:

```text
node C:/Users/Callum/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.3/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/educational-organization-manifest
```

Repair only GoalBuddy control files during board-health work unless an active Worker or PM task explicitly allows product-file edits.

## Canonical Board

Machine truth lives at:

`docs/goals/educational-organization-manifest/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
Codex: /goal Follow docs/goals/educational-organization-manifest/goal.md.
Claude Code: /goalbuddy Follow docs/goals/educational-organization-manifest/goal.md.
```

## PM Loop

On every continuation: read this charter and the GoalBuddy execution contract, read `state.yaml`, run the update checker when available, work only on the active task, record a compact receipt, advance to the next largest safe slice, review at boundaries, and run `check-can-stop.mjs` before ending. No queued required Worker or active task may remain when the goal is completed.
