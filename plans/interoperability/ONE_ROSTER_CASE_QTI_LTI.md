# 1EdTech Integration Boundaries

## OneRoster

### Relevant overlap

- organization;
- academic session;
- course;
- class;
- user/staff in limited contexts.

### EOM interpretation

- OneRoster course may map to an EOM course definition when semantics align.
- OneRoster class may map to an EOM offering or section.
- academic sessions may map to EOM academic periods.
- organizations may map to schools/districts/campuses.

### Prohibited public projection

Do not publish:

- students;
- enrollments;
- grades/results;
- private user identifiers;
- personal schedules;
- authentication/API credentials.

The adapter must be allowlist-based and create a reviewable candidate.

## CASE

EOM should represent standards alignment primarily through references:

- framework URI/identifier;
- item URI/identifier;
- code/label snapshot;
- framework version;
- alignment type;
- source/provenance.

A complete CASE framework should remain in CASE or a dedicated standards API. EOM does not need to embed every competency.

Potential alignment relations:

- alignsTo;
- teaches;
- assesses;
- prerequisiteConcept;
- relatedConcept.

The exact vocabulary must be specified and versioned.

## QTI

EOM may describe a public assessment resource associated with a course or program in a future module, but QTI remains the exchange format for assessment items/tests.

Possible EOM reference:

- resource URI;
- media type;
- QTI version;
- license;
- access conditions;
- standards alignment;
- public sample status.

Never expose assessment answer keys or secure test packages merely because a link exists.

## LTI

EOM may advertise that a public-facing service exists, or link to general API/service documentation. It must not include:

- client secrets;
- platform private keys;
- deployment IDs intended to remain private;
- token endpoints with credentials;
- user launch data.

LTI setup remains a private administrative integration.

## Common Cartridge

A course can link to an authorized public or access-controlled Common Cartridge package with:

- package identifier;
- format/version;
- license;
- access policy;
- digest;
- related course;
- provenance.

The EOM course record remains descriptive metadata; it does not become the package.

## Certification language

Do not use 1EdTech certification marks or claim compliance without the applicable external process. EOM mapping tests are paper&slate interoperability tests, not 1EdTech certification.
