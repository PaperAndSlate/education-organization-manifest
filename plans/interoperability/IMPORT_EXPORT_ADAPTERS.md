# Import and Export Adapter Plan

## Adapter categories

### Import candidates

- existing EOM versions;
- Schema.org JSON-LD;
- CEDS-aligned exports;
- Ed-Fi public projection;
- OneRoster public allowlist;
- iCalendar;
- CSV/Excel course catalogs;
- JSON/XML vendor feeds;
- school website/document extraction;
- common CMS exports.

### Export projections

- canonical EOM JSON;
- EOM authoring YAML;
- Schema.org JSON-LD;
- static website data;
- printable catalog model;
- iCalendar;
- JSON Feed/Atom/RSS;
- CSV administrative review export;
- public API convenience views.

## Adapter contract

Every adapter should expose:

- adapter ID/version;
- source/target format/version;
- direction;
- supported modules;
- required configuration;
- public-field allowlist;
- transformation registry;
- loss report;
- provenance behavior;
- validation behavior;
- test fixtures;
- security/privacy notes.

## Intermediate representation

Use the EOM authoring model or a deliberately small normalized claim model. Avoid an undocumented “universal education object” that becomes a second standard.

Recommended pipeline:

```text
source parser
→ source-specific records
→ claims/evidence
→ identity resolution
→ EOM authoring candidate
→ review
→ canonical generator
```

## Import safety

- parse files without macros or active content;
- limit archive depth and expansion;
- guard XML entity expansion;
- limit spreadsheet size/formulas;
- sanitize rich text;
- never execute imported scripts;
- do not follow external links automatically;
- quarantine prohibited personal data;
- log source digests.

## Export determinism

Exporters should be deterministic for the same approved inputs and versions. Reports should include omitted/lossy fields.

## Plugin model

Keep official core adapters in reviewed packages. Permit third-party adapters through a stable plugin interface, but do not execute arbitrary plugins inside public hosted tools.

## Adapter maturity

Statuses:

- experimental;
- preview;
- stable;
- deprecated.

Stable status requires:

- documented semantic mapping;
- fixture coverage;
- privacy review;
- compatibility matrix;
- maintenance owner;
- versioning policy.
