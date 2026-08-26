# Schema Engineering

## Source of truth

JSON Schema 2020-12 files are the normative structural source.

Do not maintain independent Zod, TypeScript, and JSON Schema definitions by hand.

## Schema conventions

Every schema must include:

- `$schema`;
- immutable `$id`;
- `title`;
- `description`;
- version metadata;
- license metadata where practical;
- explicit `type`;
- `additionalProperties: false` or `unevaluatedProperties: false` as appropriate;
- reusable `$defs`;
- examples separated from normative assertions.

## Composition

Use:

- shared common schemas;
- module-specific schemas;
- profile schemas layering requirements;
- stable references to immutable versioned `$id` values.

Avoid:

- circular references that common tooling cannot resolve;
- deep `oneOf` ambiguity;
- unrestricted arbitrary objects;
- regexes vulnerable to catastrophic backtracking;
- format assertions without a documented implementation policy.

## Schema catalog

Publish a catalog:

```json
{
  "version": "1.0",
  "schemas": [
    {
      "id": "https://paperandslate.org/schemas/eom/1.0/manifest.schema.json",
      "type": "manifest",
      "sha256": "..."
    }
  ]
}
```

The validator ships an offline bundled catalog.

## Formats

Custom or enforced formats may include:

- absolute URI;
- HTTPS URI;
- BCP 47 language tag;
- IANA timezone;
- RFC 3339 timestamp;
- ISO country code;
- currency;
- JSON Pointer.

Each format needs:

- normative definition;
- validator behavior;
- test vectors;
- browser/Node consistency.

## Semantic rules

Do not force graph constraints into unreadable JSON Schema.

Examples handled by semantic validator:

- unique IDs across resources;
- default language exists;
- references resolve;
- offering references a course;
- delegation scope;
- effective date ordering;
- provenance pointer validity;
- capability/resource consistency;
- no duplicate normalized identifier values.

## Type generation

Generate TypeScript from schemas in CI.

Requirements:

- stable formatting;
- generated header;
- schema commit/version reference;
- no manual edits;
- drift check;
- type-level tests for representative unions;
- exported discriminated unions by `type`.

## Schema tests

For each schema:

- meta-validation;
- minimal valid fixture;
- rich valid fixture;
- invalid fixture per required constraint;
- unknown property rejection;
- extension acceptance;
- compatibility tests with previous minor version.

## Schema release

Versioned schema files are immutable after release. Corrections that change validation receive a new version.

`latest` is a generated alias only.

## Documentation generation

Generate field reference tables from schemas, but keep prose explanations in human-authored docs. Generated tables do not replace normative semantic requirements.

## Validation dialect

Pin Ajv configuration and document:

- strict mode;
- format behavior;
- unevaluated properties;
- default insertion disabled;
- coercion disabled;
- mutation disabled;
- all errors enabled with bounded output.

Validation must not alter input data.
