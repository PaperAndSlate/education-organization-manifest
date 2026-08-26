# Phase 5: provenance and evidence-led agent workflows

Status: implemented locally as a working draft. This report records repository evidence; it does not claim institutional approval, legal clearance, pilot adoption, or publication.

## Delivered

- resource/object/field provenance records with RFC 6901 target checks;
- source inventory, claim/evidence, conflict, review-decision, and candidate-workspace schemas;
- precedence recommendations that preserve all competing values;
- stale-source and stale-claim warning findings;
- candidate-only workspace paths and generator enforcement against direct candidate publication;
- privacy quarantine with redacted review reports;
- prompt catalog metadata validation and controlled fixture examples;
- local candidate review CLI behavior.

## Evidence

- `schemas/1.0/provenance.schema.json`
- `schemas/1.0/source.schema.json`
- `schemas/1.0/evidence.schema.json`
- `schemas/1.0/conflict.schema.json`
- `schemas/1.0/review.schema.json`
- `schemas/1.0/candidate.schema.json`
- `packages/agentic/src/index.ts`
- `packages/linter/src/provenance.ts`
- `fixtures/agentic/`
- `fixtures/valid/provenance/`
- `fixtures/invalid/privacy/student-record.json`
- `tests/agentic.test.ts`
- `scripts/check-prompts.ts`

## Boundaries

The implementation uses controlled local fixtures. It does not crawl the Internet, bypass access controls, retain raw private records, infer publication authority, silently resolve conflicts, or publish candidate workspaces. Live source rights, institutional owner review, and any production ingestion service remain external gates.
