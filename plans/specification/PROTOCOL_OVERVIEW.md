# Protocol Overview

## Status

Planning document for EOM v1.0. Normative language in the eventual specification must use BCP 14 terminology deliberately.

## Model

EOM is a public publication and discovery protocol.

At its simplest:

1. A client starts with an HTTPS origin associated with an educational organization.
2. The client requests:
   `/.well-known/educational-organization-manifest`
3. The response identifies the publisher, scope, represented organizations, capabilities, authoritative linked resources, delegation, and protocol version.
4. The client follows only the resources it needs.
5. The client validates structure and semantic constraints.
6. The client records retrieval time and provenance.
7. The client may verify optional digests and signatures.

## Required v1 resource types

The protocol core defines:

- `manifest`;
- `organization-profile`;
- `organization-index`;
- `resource-index`;
- `key-set`;
- `conformance-report`.

School-profile modules define:

- `campus-catalog`;
- `department-catalog`;
- `staff-directory`;
- `contact-directory`;
- `course-catalog`;
- `course-offering-catalog`;
- `program-catalog`;
- `academic-calendar`;
- `event-catalog`;
- `facility-catalog`;
- `service-catalog`;
- `policy-catalog`;
- `admissions-profile`;
- `sports-catalog`;
- `transportation-catalog`;
- `meal-menu-catalog`;
- `club-catalog`;
- `job-catalog`;
- `news-feed`;
- `statistics-profile`;
- `api-reference`.

These names are protocol resource-type identifiers, not required URL paths.

## Core conformance minimum

A Core Publisher must provide:

- a valid manifest;
- one valid organization profile or organization index;
- protocol and schema version;
- canonical absolute identifiers;
- publisher and scope;
- at least one organization subject;
- at least one declared capability;
- no prohibited private data.

A School Publisher profile adds recommended school-specific fields but should avoid making optional public information mandatory merely for certification.

## Authority model

### Origin authority

Control of the HTTPS origin serving the well-known manifest establishes the publication root.

### Manifest authority

The root manifest identifies which organization or platform is publishing and which resources are authoritative for each subject.

### Delegated authority

The root may delegate specific resource types or resource IDs to another origin, maintainer, or signing key.

### Observed copies

Mirrors, indexes, caches, and API aggregators are observations. They must preserve the source URI, retrieval time, and original provenance.

## Data representation

- Canonical wire format: JSON.
- Character encoding: UTF-8.
- Structural schemas: JSON Schema 2020-12.
- Recommended JSON subset: I-JSON-compatible.
- Human authoring formats: JSON or YAML transformed into canonical JSON.
- Bulk CSV imports may be supported by tools but are not EOM wire resources.
- Unknown top-level fields fail structural validation.
- Extensions live in a namespaced `extensions` object.

## Resource envelope

Every EOM resource should share a common envelope:

```json
{
  "$schema": "https://paperandslate.org/schemas/eom/1.0/course-catalog.schema.json",
  "specification": "https://paperandslate.org/spec/eom/1.0",
  "version": "1.0",
  "id": "https://ecme-high.example/eom/courses",
  "type": "course-catalog",
  "canonical": "https://ecme-high.example/eom/courses.json",
  "publisher": {
    "id": "https://ecme-high.example/id/school"
  },
  "subjects": [
    {
      "id": "https://ecme-high.example/id/school"
    }
  ],
  "defaultLanguage": "en-US",
  "effective": {
    "from": "2027-07-01",
    "until": "2028-06-30"
  },
  "provenance": [],
  "extensions": {},
  "data": {}
}
```

The final schemas may flatten selected fields for usability, but the same conceptual envelope must remain.

## Capabilities versus resources

A capability states that a feature is supported and may include profile/version information. A resource descriptor points to a concrete representation.

Example:

```json
{
  "capabilities": [
    {
      "id": "https://paperandslate.org/eom/capabilities/course-catalog",
      "version": "1.0"
    }
  ],
  "resources": [
    {
      "id": "https://ecme-high.example/eom/resources/course-catalog",
      "type": "course-catalog",
      "href": "https://catalog.ecme-high.example/eom/courses.json",
      "mediaType": "application/json"
    }
  ]
}
```

Clients must not infer a capability only from a vague website link.

## Collections and scale

Large resources may use:

- index resources;
- chunk resources;
- pagination metadata for APIs;
- time-bounded archives;
- language-specific alternatives;
- content-addressed snapshots.

The root manifest should link to an index rather than embed thousands of entries.

## Relationship to other standards

EOM does not replace:

- Schema.org for search-facing linked-data markup;
- OneRoster for rostering and gradebook exchange;
- Ed-Fi for secure operational education data interoperability;
- CEDS for detailed education vocabulary and data modeling;
- CASE for competencies and standards;
- QTI for assessment item/test exchange;
- Common Cartridge for learning-content packages;
- LTI for learning-tool integration.

EOM should link, map, or export to these when the use case overlaps.

## Truth and validation

A valid document may still contain stale or inaccurate information. Consumers should evaluate:

- source authority;
- provenance;
- effective dates;
- retrieval time;
- signature status;
- conflict status;
- freshness expectations;
- conformance profile.

The validator must never label data “verified true” solely because it is schema-valid.
