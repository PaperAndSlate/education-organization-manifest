# Educational Organization Manifest — Codex Project Pack

This pack is the implementation brief for a new open-source repository maintained by **paper&slate** (`paperandslate.org`).

The selected working protocol name is **Educational Organization Manifest**, abbreviated **EOM**. Its proposed discovery endpoint is:

`https://<education-origin>/.well-known/educational-organization-manifest`

The name and suffix are working selections for implementation and public review. Production recommendations must not be finalized until the suffix has completed the applicable IANA registration process.

## What this pack is for

The target repository will define and implement a neutral, open protocol that lets a school, district, college, university, training provider, or other educational organization publish authoritative, public, machine-readable information from its own web origin.

The root manifest is intentionally a small discovery and authority document. It points to modular resources such as:

- organization and campus profiles;
- departments and staff directories;
- course definitions, course catalogs, and course offerings;
- programs and pathways;
- academic calendars and events;
- facilities, services, policies, and admissions information;
- sports, clubs, transportation, meal menus, jobs, and news;
- public aggregate statistics;
- public APIs and related service descriptions.

The repository will also provide schemas, a validator, a linter, a deterministic generator, a command-line interface, optional signature verification, conformance tests, documentation, agentic generation workflows, and a rich fictitious school example.

## How to use the pack

1. Create an empty GitHub repository, preferably:
   `paperandslate/educational-organization-manifest`
2. Place this entire pack in a temporary planning directory, such as:
   `project-plans/eom/`
3. Give Codex the `MASTER_CODEX_GOAL_PROMPT.txt` file.
4. Require Codex to read all planning files before changing code.
5. Execute the work in the phases defined in `delivery/PHASES_AND_MILESTONES.md`.
6. Do not recommend third-party production deployment before the registration gate in `specification/IANA_REGISTRATION_PLAN.md` is satisfied.
7. Keep the school website/CMS product in a separate repository. It may consume or generate EOM data, but EOM must remain independently implementable.

## Documents to read first

Codex should begin with:

1. `00_PROJECT_BRIEF.md`
2. `01_CONFIRMED_DECISIONS.md`
3. `02_NAMING_DECISION.md`
4. `03_REPOSITORY_BLUEPRINT.md`
5. `04_IMPLEMENTATION_PRINCIPLES.md`
6. `specification/PROTOCOL_OVERVIEW.md`
7. `architecture/MONOREPO_ARCHITECTURE.md`
8. `delivery/PHASES_AND_MILESTONES.md`
9. `delivery/DEFINITION_OF_DONE.md`
10. `MASTER_CODEX_GOAL_PROMPT.txt`

## Non-negotiable boundaries

EOM is for deliberately published institutional information. It is not a student information exchange format.

The protocol must never include:

- individual student records;
- grades or individual attendance;
- IEP, 504, SEN, medical, disability, or safeguarding records;
- discipline records;
- individual transportation assignments;
- private staff information;
- credentials, secrets, tokens, or internal-only API endpoints.

A school may deliberately publish selected staff information, but the standard must prefer role-based contacts and must provide privacy review tooling.

## Stewardship

The protocol is neutral infrastructure stewarded by paper&slate. The standard name, schemas, and conformance language should not make implementations dependent on paperandslate.org at runtime. paperandslate.org may host canonical specifications, schemas, registries, documentation, tools, and a public convenience index, but each educational organization remains authoritative for what it publishes on its own origin.
