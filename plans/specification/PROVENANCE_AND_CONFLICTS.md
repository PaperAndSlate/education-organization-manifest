# Provenance, Evidence, Confidence, and Conflicts

## Principle

Shape validation is not factual verification. EOM must make source and transformation history visible.

## Provenance levels

### Resource level

Default provenance applying to a whole document.

### Object level

Provenance attached directly to an entity such as one course.

### Field level

Provenance targeted to JSON Pointer paths for selected values.

## Provenance record

Proposed fields:

```json
{
  "id": "https://ecme-high.example/eom/provenance/course-catalog-2027",
  "source": "https://ecme-high.example/documents/course-catalog-2027.pdf",
  "sourceType": "institutional-publication",
  "assertedBy": "https://ecme-high.example/id/school",
  "observedAt": "2027-02-15T18:00:00Z",
  "retrievedAt": "2027-02-15T18:02:00Z",
  "effective": {
    "from": "2027-07-01",
    "until": "2028-06-30"
  },
  "method": "human-reviewed-extraction",
  "transformation": "https://paperandslate.org/methods/pdf-course-extraction/1.0",
  "license": "https://creativecommons.org/publicdomain/mark/1.0/",
  "contentDigest": "sha-256=:...:",
  "verificationStatus": "reviewed",
  "confidence": 1
}
```

## Field targeting

Use RFC 6901 JSON Pointer:

```json
{
  "provenanceMap": [
    {
      "targets": [
        "/data/enrollment/count"
      ],
      "provenance": "https://.../provenance/state-enrollment"
    }
  ]
}
```

Avoid array-index pointers when stable object IDs can support object-level provenance.

## Confidence

Confidence is useful for agent candidate workspaces and derived datasets. Organization-authored canonical publications should not imply that a numeric confidence score proves truth.

Allowed statuses:

- asserted;
- extracted;
- reviewed;
- verified-against-source;
- disputed;
- stale;
- withdrawn.

Numeric confidence:

- optional;
- range 0 to 1;
- accompanied by method;
- never used as the only publication gate;
- generally kept internal until reviewed.

## Source types

Initial vocabulary:

- organization-publication;
- organization-website;
- organization-api;
- government-registry;
- government-statistical-dataset;
- standards-body;
- vendor-authorized-feed;
- human-submission;
- agent-extraction;
- foundation-derived;
- mirror;
- unknown.

## Approved precedence model

For merge decisions:

1. authoritative government identity identifiers;
2. organization-published current operational information;
3. authoritative public government datasets;
4. foundation-derived or inferred enrichment.

Nuance:

- organization operational data may be newer than a government snapshot;
- government legal status may outrank a school page;
- a source can be authoritative for one field but not another;
- precedence must be configurable by claim category;
- the original claims must remain traceable.

## Conflict representation

Example:

```json
{
  "conflicts": [
    {
      "id": "https://.../conflict/enrollment-2027",
      "subject": "https://ecme-high.example/id/school",
      "path": "/data/enrollment/count",
      "claims": [
        {
          "value": 612,
          "provenance": "https://.../school-census"
        },
        {
          "value": 605,
          "provenance": "https://.../state-dataset"
        }
      ],
      "status": "unresolved",
      "reason": "Different observation dates"
    }
  ]
}
```

A published organization resource may choose one current value while retaining conflict notes. A foundation index should preserve both observed claims.

## Staleness

Each module has expected update cadence. Tooling should calculate:

- age since `modified`;
- age since source observation;
- time until expiry;
- broken source links;
- conflicting newer claims.

Staleness is a warning unless a profile defines a maximum age.

## Evidence ledger

Agent workflows use a separate review ledger containing:

- source locator;
- exact page/section/selector;
- extracted value;
- target path;
- confidence;
- transformation;
- reviewer;
- review result;
- notes;
- privacy flags.

The public resource may publish summarized provenance without exposing copyrighted excerpts or internal notes.
