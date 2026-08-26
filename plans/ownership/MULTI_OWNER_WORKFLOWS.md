# Multi-Owner Workflows

## Goal

Let different teams maintain their domain data without creating conflicting publication authority.

## Recommended roles

- publication administrator;
- organization profile owner;
- curriculum owner;
- department owner;
- communications owner;
- staff/HR reviewer;
- athletics owner;
- transportation owner;
- food-service owner/vendor;
- data governance reviewer;
- security/privacy reviewer.

## Workflow A — Department-owned course files

1. Department owner edits course source under owned directory.
2. Generator validates local file.
3. PR requests department and curriculum approvals.
4. CI builds complete catalog.
5. Semantic diff shows public changes.
6. Publication administrator approves release.
7. atomic deployment updates resources/root if needed.

## Workflow B — Vendor-owned menus

1. School root defines delegation.
2. Vendor produces menu resource on approved origin/path.
3. Vendor validates and optionally signs.
4. School monitoring checks availability/schema/freshness.
5. Root links current resource.
6. School can revoke or replace delegation.

## Workflow C — District-owned transportation

1. District publishes shared transportation catalog.
2. School root or district organization index links/delegates it.
3. Resource subjects enumerate schools/campuses served.
4. School site consumes only relevant routes.
5. No student assignments included.

## Workflow D — Communications-owned news/events

Communications owns source; clubs/teams may submit candidates. Publication occurs only after communications approval.

## Workflow E — Agent-proposed updates

1. Agent reads approved sources.
2. Candidate files go to `candidates/<run-id>/`.
3. Evidence ledger records claims.
4. Privacy scan.
5. Human selects/edits.
6. PR generated.
7. normal CODEOWNERS rules apply.

## Conflict handling

- duplicate object ID: error;
- two owners change same path: explicit conflict;
- imported and manual claim differ: preserve provenance and require policy;
- stale vendor resource: warn/disable capability according to deployment policy;
- root/resource mismatch: root authority wins for discovery, but data conflict remains recorded.

## Emergency update

For urgent public corrections:

- narrowly scoped privileged path;
- two-person approval where possible;
- audit trail;
- follow-up normal PR;
- no bypass for secrets/private data.

## Audit log

Deployment tooling should log:

- actor;
- source commit;
- approvals;
- build fingerprint;
- resources changed;
- publication time;
- rollback.
