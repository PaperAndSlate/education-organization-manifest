# Evidence Ledger Design

## Purpose

The evidence ledger is an internal review artifact that connects every agent-generated or externally enriched candidate value to its source. It is not normally published in the EOM output.

## Recommended storage

```text
workspace/
  sources/
    source-index.yaml
    snapshots/
  candidates/
    organization.yaml
    courses/
  evidence/
    claims.ndjson
    conflicts.yaml
    review-decisions.yaml
  reports/
    extraction-report.json
    privacy-report.json
    validation-report.json
```

Keep source snapshots out of Git when rights, size, or privacy make that inappropriate. Store digests and controlled references instead.

## Claim record

Recommended logical fields:

```yaml
claimId: claim_01J...
target:
  resourceId: https://ecme-high.example/eom/courses.json
  pointer: /items/17/description
proposedValue: Advanced study of...
source:
  sourceId: source_course_catalog_2027
  locator:
    page: 42
    section: CUL-202
    textRange: 1102-1430
  observedAt: 2027-01-12T16:02:00Z
evidence:
  excerpt: Short, review-appropriate excerpt
  contentDigest: sha256-...
method:
  kind: direct-extraction
  agent: codex
  modelVersion: recorded-by-runner
  promptVersion: create-course-catalog/1
confidence: 0.96
authorityClass: organization-origin
transformation:
  kind: normalize-whitespace
privacyClass: public-reviewed
review:
  state: pending
  requiredOwner: curriculum-office
```

## Review decision

Each accepted, rejected, or modified claim should record:

- reviewer identity or team role;
- timestamp;
- decision;
- selected value;
- rationale;
- conflicting claims considered;
- required follow-up;
- expiry or re-review date.

## Conflict record

A conflict groups claims targeting the same conceptual fact and includes:

- conflict ID;
- target;
- competing claim IDs;
- conflict type;
- recommended selection;
- precedence explanation;
- materiality;
- reviewer assignment;
- resolution.

Conflict types include:

- direct disagreement;
- effective-date mismatch;
- unit mismatch;
- stale source;
- naming variation;
- identifier collision;
- scope mismatch;
- translation disagreement;
- inferred relationship.

## Provenance promotion

On approval, selected portions of the ledger may be promoted into public EOM provenance:

- source URI;
- source type;
- observed/verified dates;
- effective period;
- license;
- transformation summary;
- confidence only when useful and clearly defined.

Do not publish internal reviewer identities, private document locations, prompts containing sensitive material, or copyrighted source excerpts.

## Tamper evidence

For high-assurance workflows:

- hash source snapshots;
- hash evidence ledger records;
- produce a build manifest containing input digests;
- optionally sign the review decision bundle;
- retain the build/release commit SHA.

This provides an audit trail without making signatures mandatory for ordinary v1 publishers.

## Retention

The implementation must make retention configurable. Recommended policies:

- retain source metadata and approved claim records for the life of the publication plus a defined historical period;
- remove unnecessary raw documents after review when licensing or privacy requires;
- preserve public historical versions separately;
- never retain accidentally ingested private student data—quarantine, report, and securely delete it.
