# Evidence-Led Extraction Methodology

## Objective

Provide a controlled method for turning public school information into EOM authoring sources without presenting machine inference as verified institutional truth.

## Core rule

The extraction product is a **candidate dataset**, not a publication.

The candidate becomes publishable only after schema validation, semantic review, privacy review, source review, conflict resolution, and approval by an authorized human owner.

## Permitted source classes

The initial workflow may consume sources approved by the operator:

- the organization's public website;
- public district or governing-body pages;
- public course catalogs;
- public student/parent handbooks;
- public academic calendars;
- public policy documents;
- public menu or transportation feeds;
- public government school registries and reports;
- public accreditation or qualification records;
- public CSV/JSON/XML/API exports;
- organization-provided questionnaires;
- organization-approved internal exports that contain only public fields.

A source being publicly reachable does not automatically make every field suitable for republication.

## Extraction stages

### 1. Source inventory

For every source, record:

- source ID;
- canonical URL or document identifier;
- title;
- publisher;
- source type;
- jurisdiction;
- retrieved time;
- content digest;
- license/terms status;
- access restrictions;
- effective date;
- likely modules;
- review owner.

Reject sources that require bypassing authentication, access controls, robots restrictions where applicable, or licensing restrictions.

### 2. Capture

Store an immutable review snapshot or an auditable content digest when legally and operationally appropriate. Keep raw source material outside the public output.

The capture layer must distinguish:

- raw bytes;
- normalized text;
- structured extraction;
- published candidate.

### 3. Claim extraction

Each atomic claim becomes a candidate record with:

- target resource and JSON Pointer;
- proposed value;
- exact evidence locator;
- evidence excerpt kept within applicable copyright limits;
- extraction method;
- confidence;
- source authority class;
- effective period;
- ambiguity flags;
- privacy class.

### 4. Normalization

Normalization may include:

- date/time conversion;
- BCP 47 language tagging;
- country and subdivision codes;
- address structuring;
- identifier namespacing;
- credit and education-level mapping;
- course code normalization;
- localized text packaging;
- URI resolution.

Normalization must preserve the original value in the evidence ledger and record the transformation.

### 5. Entity resolution

Do not merge entities solely because names are similar.

Use a weighted process involving:

- authoritative identifiers;
- canonical origin;
- address;
- governing organization;
- published relationship;
- contact information;
- effective dates.

Ambiguous matches remain separate candidates with a review task.

### 6. Conflict handling

When sources disagree:

- preserve all material claims;
- apply the documented precedence model only to create a recommendation;
- expose the conflict to reviewers;
- never erase the losing claim from the evidence ledger;
- record the selected value and rationale.

### 7. Confidence

Confidence is workflow metadata, not truth.

Suggested bands:

- `1.00`: directly copied from an authoritative structured source and independently validated;
- `0.90–0.99`: explicit statement from an authoritative source;
- `0.75–0.89`: explicit statement from a lower-authority or older source;
- `0.50–0.74`: normalized or mapped with material assumptions;
- below `0.50`: inference; do not propose for automatic publication.

A high model confidence must not override low source authority.

### 8. Review

Required review dimensions:

- factual accuracy;
- authority;
- effective date;
- privacy/publication suitability;
- rights/license;
- semantic fit;
- language/translation;
- conflict resolution;
- ownership approval.

### 9. Build and validate

Generate canonical output only from approved authoring sources. Run:

- JSON Schema validation;
- semantic lint;
- cross-resource reference checks;
- privacy lint;
- provenance coverage;
- stale-source checks;
- deterministic build;
- output diff.

### 10. Pull request

The agent creates a pull request containing:

- summary;
- source inventory;
- changed modules;
- confidence distribution;
- unresolved conflicts;
- privacy report;
- validation report;
- generated diff;
- reviewers required by CODEOWNERS.

Direct merge and direct publication are disabled by default.

## Source precedence

A default recommendation, not an unconditional overwrite rule:

1. verified authoritative government identity/identifier record;
2. current organization-origin statement for organization-controlled information;
3. current governing-body or district-origin statement;
4. authoritative public government dataset;
5. organization-approved vendor feed;
6. foundation-derived normalization or crosswalk;
7. third-party informational source.

Different facts may have different natural authorities. A school should generally control its public course descriptions, while an education authority may control an official identifier.

## Prohibited behavior

- fabricate missing fields;
- infer sensitive attributes;
- use people-search or data-broker sources;
- crawl login-protected systems without explicit authorization;
- treat search snippets as evidence;
- translate names without marking the translation;
- silently rewrite marketing text as factual accreditation;
- publish model-generated summaries as official text;
- copy copyrighted documents wholesale into the repository;
- overwrite a human-authored value without a review-visible conflict.
