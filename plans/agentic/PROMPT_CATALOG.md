# Agent Prompt Catalog

The target repository should include versioned prompts as operational assets, not informal snippets.

## Prompt contract

Each prompt must be:

- self-contained;
- explicit about the repository and target module;
- evidence-led;
- privacy bounded;
- prohibited from direct publication by default;
- deterministic where possible;
- required to emit a structured completion report;
- paired with fixture tests or dry-run examples.

## Discovery and extraction prompts

| Prompt | Purpose |
|---|---|
| `create-from-website.txt` | Build a candidate from approved public web pages |
| `create-from-documents.txt` | Extract from approved PDFs, DOCX, CSV, JSON, or text |
| `create-course-catalog.txt` | Normalize course definitions and separate offerings |
| `update-existing-school.txt` | Compare new sources with an existing EOM source tree |
| `enrich-from-public-data.txt` | Add authoritative public identifiers/statistics with provenance |
| `add-department.txt` | Add one department and ownership |
| `add-courses.txt` | Add or revise courses under an approved department |

## Audit and maintenance prompts

| Prompt | Purpose |
|---|---|
| `audit-school-data.txt` | Factual, schema, link, and consistency audit |
| `find-stale-information.txt` | Identify freshness and effective-date risks |
| `verify-source-provenance.txt` | Check every published claim against evidence |
| `privacy-review.txt` | Detect prohibited or risky publication |
| `migrate-schema.txt` | Migrate authoring sources across versions |
| `generate-website-assets.txt` | Generate previews/exports from approved EOM data |

## Implementation prompts

The `implementation/` prompts divide the master goal into bounded phases:

- repository bootstrap;
- schemas and core protocol;
- module schemas;
- generator/validator/CLI;
- provenance and agents;
- delegation/signatures;
- docs/playground;
- conformance/release.

## Prompt versioning

Store prompt metadata in a sibling YAML or front matter:

- prompt ID;
- version;
- owner;
- compatible EOM version;
- last reviewed;
- input contract;
- output contract;
- safety class.

A prompt change that alters extracted semantics should be reviewable and tied to a changelog entry.
