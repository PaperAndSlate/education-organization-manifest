# Resources and Capabilities

## Resource descriptor

A resource descriptor links the manifest to a machine-readable document.

Proposed structure:

```json
{
  "id": "https://ecme-high.example/eom/resource/course-catalog",
  "type": "course-catalog",
  "href": "https://catalog.ecme-high.example/eom/courses.json",
  "mediaType": "application/json",
  "profile": "https://paperandslate.org/spec/eom/1.0/profiles/course-catalog",
  "version": "1.0",
  "subjects": [
    "https://ecme-high.example/id/school"
  ],
  "languages": ["en-US", "es"],
  "authority": {
    "delegation": "https://ecme-high.example/id/delegation/catalog-vendor"
  },
  "integrity": {
    "digest": "sha-256=:...:",
    "signature": "https://catalog.ecme-high.example/eom/courses.jws"
  },
  "modified": "2027-05-01T12:00:00Z",
  "expires": "2027-08-01T12:00:00Z"
}
```

## Required descriptor fields

- `id`;
- `type`;
- `href`;
- `mediaType`;
- `version`;
- at least one subject or an explicit origin-wide scope.

## Optional descriptor fields

- profile;
- schema;
- title;
- description;
- languages;
- alternate representations;
- authority/delegation;
- integrity;
- freshness;
- effective dates;
- license;
- access policy;
- collection/chunk metadata;
- extensions.

## Resource type registry

Core resource types must have stable absolute URI identifiers. Human-friendly short strings may be allowed in authoring source and normalized by the generator.

The registry records:

- identifier;
- short name;
- description;
- schema;
- current version;
- compatible versions;
- collection behavior;
- freshness guidance;
- privacy classification;
- conformance profile;
- change controller.

## Capability descriptor

A capability describes supported behavior, not merely the presence of one file.

Example:

```json
{
  "id": "https://paperandslate.org/eom/capability/multilingual-values",
  "version": "1.0",
  "status": "active"
}
```

Useful capabilities include:

- multilingual values;
- resource delegation;
- detached signatures;
- field provenance;
- course offerings;
- chunked catalogs;
- public indexing permitted;
- Schema.org projection available;
- conformance report available.

## Capability status

- `active`;
- `experimental`;
- `deprecated`;
- `retired`.

Experimental capabilities cannot be required by stable core conformance.

## Alternates

A resource may advertise alternate formats:

```json
{
  "alternates": [
    {
      "href": "https://ecme-high.example/catalog.pdf",
      "mediaType": "application/pdf",
      "purpose": "human-readable"
    },
    {
      "href": "https://ecme-high.example/catalog.jsonld",
      "mediaType": "application/ld+json",
      "purpose": "schemaorg-projection"
    }
  ]
}
```

The alternate is not necessarily semantically lossless. Include `fidelity`:

- `canonical`;
- `lossless`;
- `projected`;
- `human-readable`;
- `summary`.

## Resource indexes

A resource index supports large collections.

Fields:

- collection ID;
- item type;
- chunks or pages;
- ordering;
- continuation;
- total item count when known;
- snapshot time;
- partition strategy;
- language and effective-period coverage;
- digests.

Static chunk example:

```json
{
  "chunks": [
    {
      "href": "/eom/courses/a-f.json",
      "range": {"from": "A", "through": "F"}
    }
  ]
}
```

Do not require runtime pagination for static hosting.

## API references

When an educational organization exposes public APIs:

- reference an existing `/.well-known/api-catalog` when available;
- link OpenAPI documents;
- identify terms, authentication, rate limits, and audience;
- never expose internal-only endpoint metadata;
- do not duplicate a full API catalog inside EOM.

## Broken resources

Consumers should distinguish:

- manifest valid, resource unavailable;
- resource invalid;
- resource expired;
- resource moved;
- resource signature invalid;
- resource outside delegation scope.

A failure in one optional module should not invalidate unrelated modules or the root manifest.
