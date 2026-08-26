# Operator Handoff

## What this pack provides

This is a complete implementation-planning pack for creating the `paperandslate/educational-organization-manifest` repository with Codex. It is not the finished protocol implementation.

The pack supplies:

- approved product decisions;
- protocol and data-model design;
- architecture and package boundaries;
- governance and licensing plans;
- security/privacy threat boundaries;
- multi-owner workflows;
- agent prompts;
- implementation phases;
- issue backlog;
- definition of done;
- roadmap;
- website copy and tools;
- Ecme High planning/reference data.

## Recommended repository setup

1. Create a private or draft-public empty repository:
   `paperandslate/educational-organization-manifest`
2. Enable:
   - branch protection;
   - pull-request reviews;
   - CODEOWNERS review;
   - secret scanning;
   - dependency alerts;
   - signed release/tag policy where practical.
3. Place this pack at:
   `project-plans/eom/`
4. Commit the planning pack before implementation so decisions are auditable.
5. Open an umbrella issue linking the phase backlog.

## Recommended Codex execution

### Controlled phase mode

Preferred:

1. Give Codex `MASTER_CODEX_GOAL_PROMPT.txt`.
2. Instruct it to perform the initial inventory and traceability matrix.
3. Run one implementation prompt from `agentic/prompts/implementation/` at a time.
4. Review the phase report and Git diff.
5. Merge only after gates pass.
6. Continue to the next phase.

### Long goal mode

The master prompt permits a long-running goal execution, but Codex must still:

- commit/report by phase;
- stop at external gates;
- not pretend IANA approval or independent pilots occurred;
- keep unresolved items explicit.

## First human reviews

Before public launch, obtain review from people with experience in:

- school/district public data;
- curriculum/course catalogs;
- web standards;
- privacy/security;
- international education;
- accessibility;
- vendor integrations.

Review is evidence gathering, not automatic endorsement.

## External actions Codex cannot complete alone

Codex can prepare but cannot truthfully complete without external evidence:

- IANA registration acceptance;
- independent implementation/pilot testing;
- legal review;
- school approval to publish real data;
- public community consensus;
- third-party certification.

The repository should track each as a blocked issue with the exact evidence required.

## Naming status

Use:

> Educational Organization Manifest (EOM), a proposed open protocol stewarded by paper&slate.

Use the working endpoint in development fixtures:

`/.well-known/educational-organization-manifest`

Do not say “IANA registered” until accepted and recorded.

## Files to start with

Human operator:

1. `README.md`
2. `00_PROJECT_BRIEF.md`
3. `01_CONFIRMED_DECISIONS.md`
4. `02_NAMING_DECISION.md`
5. `roadmap.md`
6. `OPERATOR_HANDOFF.md`

Codex:

1. `MASTER_CODEX_GOAL_PROMPT.txt`
2. `CODEX_EXECUTION_PLAYBOOK.md`
3. `agentic/AGENTS.md`
4. every remaining file, indexed into the traceability matrix.
