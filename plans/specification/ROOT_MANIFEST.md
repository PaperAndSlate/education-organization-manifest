# Root Manifest Design

## Purpose

The root manifest is an authority and discovery document, not the complete school dataset.

It should answer:

- Which protocol and version is this?
- What origin and paths are in scope?
- Who publishes this declaration?
- Which educational organizations are represented?
- Which capabilities are supported?
- Where are authoritative resources?
- Who maintains or is delegated authority for each resource?
- Which keys and signatures may be used?
- When was the declaration modified and when does it expire?
- Which extension namespaces are in use?

## Proposed top-level structure

```json
{
  "$schema": "https://paperandslate.org/schemas/eom/1.0/manifest.schema.json",
  "specification": "https://paperandslate.org/spec/eom/1.0",
  "version": "1.0",
  "id": "https://ecme-high.example/.well-known/educational-organization-manifest",
  "type": "manifest",
  "canonical": "https://ecme-high.example/.well-known/educational-organization-manifest",
  "publisher": {},
  "scope": {},
  "organizations": [],
  "capabilities": [],
  "resources": [],
  "delegations": [],
  "signing": {},
  "modified": "2027-05-01T14:00:00Z",
  "expires": "2028-05-01T14:00:00Z",
  "extensions": {}
}
```

## Required fields

### `$schema`

Absolute immutable versioned schema URI.

### `specification`

Absolute immutable versioned specification URI.

### `version`

Protocol major/minor version. Patch-only editorial changes do not have to appear in instance data unless they affect schema artifacts.

### `id`

Absolute canonical identifier for this manifest.

### `type`

Literal `manifest`.

### `publisher`

The legal or operational entity controlling publication. It may be a school, district, vendor acting under contract, or foundation-operated pilot host. Publisher identity does not automatically mean the publisher is the subject school.

Suggested fields:

- `id`;
- `name`;
- `type`;
- `website`;
- `contact` role reference;
- `identifiers`;
- `statement` explaining publication authority.

### `scope`

Defines the origin-level scope:

- `origin`;
- `paths`, if the manifest represents path-scoped organizations;
- `canonicalOrigins`;
- `excludedPaths`;
- `jurisdictions`;
- `scopeStatement`.

The final semantic rules must prevent a publisher from claiming authority over unrelated origins merely by listing them.

### `organizations`

One or more lightweight subject descriptors or a pointer to an organization index.

For a single school:

```json
{
  "organizations": [
    {
      "id": "https://ecme-high.example/id/school",
      "type": "secondary-school",
      "name": "Ecme High School",
      "canonicalUrl": "https://ecme-high.example/",
      "profile": "https://ecme-high.example/eom/organization.json"
    }
  ]
}
```

For a large district, permit an `organizationIndex` resource descriptor instead of embedding every school.

### `capabilities`

Named features and profiles supported by this publisher. Each entry includes:

- capability URI;
- version;
- status;
- optional profile;
- optional resource references.

### `resources`

Concrete resource descriptors. See `RESOURCES_AND_CAPABILITIES.md`.

## Optional fields

- `delegations`;
- `signing`;
- `conformance`;
- `contacts`;
- `notices`;
- `indexingPolicy`;
- `defaultLanguage`;
- `supportedLanguages`;
- `modified`;
- `expires`;
- `provenance`;
- `extensions`.

## Manifest expiry

An `expires` value is recommended. It is not a cryptographic validity guarantee; it is a signal that consumers should refresh and possibly downgrade trust after expiry.

Linting guidance:

- warn when no expiry or freshness guidance exists;
- warn when expired;
- error only for conformance profiles that require freshness;
- preserve expired historical snapshots in indexes.

## Indexing policy

Suggested optional object:

```json
{
  "indexingPolicy": {
    "allowPublicIndexing": true,
    "allowArchiving": true,
    "allowCommercialReuse": null,
    "terms": "https://ecme-high.example/data-terms",
    "corrections": "https://ecme-high.example/contact/data-corrections"
  }
}
```

This does not override copyright, database rights, law, or an explicit resource license. The field is a discovery aid, not a substitute for legal terms.

## Minimal manifest

The repository must include a minimal valid example with:

- one school;
- one organization profile;
- one contact role;
- no signatures;
- no delegation;
- no extensions.

## Rich manifest

Ecme High must demonstrate:

- district and school relationship;
- separate module resources;
- department-owned course files;
- vendor-hosted meal menu resource;
- district-hosted transportation resource;
- optional signatures;
- conformance report;
- indexing policy;
- multilingual text.
