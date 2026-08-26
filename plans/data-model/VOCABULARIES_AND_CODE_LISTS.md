# Vocabularies and Code Lists

## Vocabulary strategy

Use URI-identified values for concepts that vary internationally or evolve.

## Vocabulary categories

- organization types;
- education levels;
- course subjects/topics;
- credit systems;
- academic period types;
- delivery modes;
- facility types;
- service types;
- sports;
- club categories;
- meal types/allergens;
- transport modes;
- contact roles;
- document/policy categories;
- statistics metrics;
- source types;
- verification statuses;
- lifecycle statuses;
- identifier schemes.

## Open versus closed

Each vocabulary declares:

- open: consumers preserve unknown URI values;
- closed: unknown values fail validation;
- extensible: core values plus namespaced additions.

Most educational classification vocabularies should be open/extensible.

## Term record

Fields:

- URI;
- code;
- preferred label;
- multilingual labels;
- definition;
- broader/narrower/related terms;
- jurisdiction;
- source;
- license;
- status;
- effective dates;
- mappings;
- change notes.

## Crosswalk semantics

Relationship types:

- exactMatch;
- closeMatch;
- broaderMatch;
- narrowerMatch;
- relatedMatch;
- supersedes;
- approximateEquivalent.

Do not call a mapping exact without evidence.

## Subject taxonomy

Do not attempt to finalize a universal subject taxonomy inside EOM v1. Support references to:

- local subject IDs;
- government taxonomies;
- standards bodies;
- future paper&slate concept registry.

## Code-list release

Vocabularies release independently but declare compatible EOM versions. Versioned snapshots must remain available.

## Localization

Labels and definitions support BCP 47 languages. Codes remain language-neutral.

## External vocabulary ingestion

Record:

- exact source/version;
- retrieval date;
- license;
- transformation;
- local additions;
- update mechanism;
- checksum.
