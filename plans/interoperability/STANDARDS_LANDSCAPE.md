# Standards Landscape

## Positioning

EOM is a public educational-organization discovery and publication protocol. It should map to established standards rather than attempting to replace private operational exchanges, learning-content packaging, assessment delivery, identity, or credentialing.

This landscape must be rechecked before each major release because external specifications evolve.

## Web and protocol standards

### RFC 8615 — Well-Known URIs

Defines the registration and use framework for `/.well-known/` resources. EOM's suffix remains a proposal until registered through the applicable IANA process.

Official source: <https://www.rfc-editor.org/rfc/rfc8615>

### IANA Well-Known URIs Registry

The implementation should include a release gate that rechecks collisions and registration status.

Official source: <https://www.iana.org/assignments/well-known-uris/well-known-uris.xhtml>

### JSON Schema 2020-12

Normative structural validation format for v1.

Official source: <https://json-schema.org/draft/2020-12>

### RFC 8785 — JSON Canonicalization Scheme

Foundation for deterministic optional signed JSON.

Official source: <https://www.rfc-editor.org/rfc/rfc8785>

### JWS and EdDSA

Relevant optional signature building blocks:

- RFC 7515, JSON Web Signature;
- RFC 7797, unencoded JWS payload option;
- RFC 8037, CFRG elliptic curve algorithms for JOSE.

### RFC 9530 — Digest Fields

Relevant to modern HTTP content digest metadata.

### RFC 9421 — HTTP Message Signatures

A possible experimental transport-level integrity profile; it should not replace resource-level signatures in v1 without an RFC.

### RFC 9727 — The `api-catalog` Well-Known URI

EOM should link to an API catalog when an organization exposes public APIs rather than duplicating a full API catalog in the root manifest.

Official source: <https://www.rfc-editor.org/rfc/rfc9727>

## General web vocabularies

### Schema.org

Useful for search-engine-facing JSON-LD:

- `EducationalOrganization` and relevant subtypes;
- `Course`;
- `CourseInstance`;
- `Event`;
- `JobPosting`;
- `Organization`;
- `ContactPoint`.

Schema.org is broad linked-data markup, not a complete substitute for EOM discovery, authority, delegation, provenance, or conformance.

Official sources:

- <https://schema.org/EducationalOrganization>
- <https://schema.org/Course>
- <https://schema.org/CourseInstance>

## Education data standards

### CEDS

The Common Education Data Standards provide a broad data vocabulary/model, particularly relevant to U.S. education data. EOM should map where concepts align but remain international and public-data focused.

Official source: <https://ceds.ed.gov/>

### Ed-Fi Data Standard

Ed-Fi models operational education data including education organizations, courses, course offerings, sections, calendars, and related entities. EOM can provide a public projection/mapping. It must not expose private Ed-Fi student data.

Official source: <https://docs.ed-fi.org/reference/data-exchange/data-standard/>

### 1EdTech OneRoster

OneRoster supports exchange of roster, course, class, enrollment, and related operational data. EOM should map public course/class concepts carefully and never imply that public EOM contains roster records.

Official source: <https://www.1edtech.org/standards/oneroster>

### 1EdTech CASE

CASE models academic standards and competencies. EOM should reference CASE framework/item identifiers or expose alignment links rather than replicate a complete standards exchange model in the school manifest.

Official source: <https://www.1edtech.org/standards/case>

### 1EdTech QTI

QTI models assessment content/results. EOM may describe public program/course/assessment resources but should not become an assessment delivery format.

Official source: <https://www.1edtech.org/standards/qti>

### LTI

LTI launches/integrates learning tools. EOM may advertise a public service reference but must not publish credentials, deployment IDs, client secrets, or private platform configuration.

Official source: <https://www.1edtech.org/standards/lti>

### Common Cartridge

Relevant to packaged learning resources and course import/export. EOM course metadata may point to a package; it does not replace the package format.

Official source: <https://www.1edtech.org/standards/common-cartridge>

### Open Badges and CLR

Potential future credential/qualification mappings. They are not required for school-focused v1.

## Calendar, feed, and geographic standards

- RFC 5545 iCalendar for calendar/event exports.
- Atom/RSS/JSON Feed for generated news feeds.
- ISO 8601/RFC 3339-compatible date/time representations.
- BCP 47 language tags.
- ISO country/subdivision codes where licenses and update processes permit.
- WGS84 coordinates for v1 geographic points.
- GeoJSON for future boundary/route modules where appropriate.

## Interoperability policy

For each external standard:

1. identify overlap;
2. document semantic differences;
3. define direction of mapping;
4. state lossiness;
5. provide tested examples;
6. version the mapping;
7. do not imply certification by the external standards body;
8. do not add private operational data merely to improve a mapping.
