# Provenance and agent workflows

EOM shape validation is not factual verification. This repository keeps three boundaries separate:

1. public resources may carry resource-, object-, or field-scoped provenance;
2. source inventories and evidence-led claims remain review metadata; and
3. agent-created candidates stay under `candidates/` until an authorized owner approves a release.

## Records

`source-record` identifies an approved locator, authority class, retrieval time, rights status, digest, likely modules, and review owner. A `claim-record` points to a resource and RFC 6901 JSON Pointer, stores a proposed value and short evidence locator, and records extraction method, confidence, privacy class, and review state. `conflict-record` preserves every competing claim while exposing a precedence recommendation. `review-decision` records the human decision and rationale. `candidate-workspace` records the state machine and carries `directPublication: false`.

The bundled schemas are `provenance.schema.json`, `source.schema.json`, `evidence.schema.json`, `conflict.schema.json`, `review.schema.json`, and `candidate.schema.json`. Generated TypeScript is derived from those schemas.

## Review gate

`@paperandslate/eom-agentic` exposes pointer validation, conflict detection, precedence recommendations, staleness findings, provenance coverage, privacy quarantine, candidate gating, and redacted review-report generation. A recommendation never removes losing claims. Inference is visible and is not publication-safe by default. A candidate must have release approval, approved public-reviewed claims, resolved conflicts, and a clear privacy review before it can pass the gate. The generator rejects source roots containing a `candidates` path segment.

The CLI command `eom candidate <workspace.json>` creates a local review summary. It does not write output or publish. Use `--claims`, `--sources`, `--conflicts`, and `--data` to attach controlled local fixtures. Reports contain counts, paths, statuses, and remediation signals—not evidence excerpts or sensitive values.

## Privacy and retention

Raw sources and snapshots are not public output. Keep only permitted metadata or digests, quarantine prohibited inputs, redact reports, and remove accidental student/private data rather than retaining it for convenience. Public provenance may summarize approved source URI, dates, license, digest, and transformation without publishing copyrighted excerpts, private reviewer identities, prompts containing sensitive content, or raw records.

Live crawling, authenticated source access, rights decisions, and institutional publication approval remain operator-controlled external gates.
