# Versioning and Extensions

## Version dimensions

EOM has several versioned layers:

- protocol specification;
- root manifest schema;
- module schemas;
- profiles;
- vocabularies;
- extension schemas;
- implementation packages.

Do not assume all layers share the same patch release.

## Semantic versioning policy

### Major

May remove fields, change meaning, tighten required constraints incompatibly, or change wire behavior.

### Minor

May add optional fields, optional resource types, vocabulary values with documented unknown-value behavior, or compatible capabilities.

### Patch

May correct typos, examples, non-normative guidance, or validator defects without changing which valid instances are accepted or their meaning.

If a “patch” changes instance validity, classify it as minor or major.

## Instance version

A resource declares the protocol major/minor it targets:

```json
{
  "version": "1.0"
}
```

The immutable `$schema` URI identifies the exact schema artifact.

## Versioned URLs

Required pattern:

- specification: `/spec/eom/1.0/`
- schema: `/schemas/eom/1.0/...`
- vocabulary: `/vocabularies/eom/1.0/...`

Optional aliases:

- `/spec/eom/latest`
- `/schemas/eom/latest/...`

Clients must not use `latest` as a persistent validation dependency.

## Compatibility declarations

A manifest may state:

```json
{
  "compatibility": {
    "minimumConsumerVersion": "1.0",
    "testedConsumerVersions": ["1.0", "1.1"]
  }
}
```

This is informative unless a profile makes it normative.

## Unknown values

For open vocabularies, consumers must preserve unknown absolute URI values and may display a fallback label.

For closed safety-critical enumerations, unknown values fail validation.

The schema registry must declare whether each vocabulary is open or closed.

## Extension container

```json
{
  "extensions": {
    "https://vendor.example/eom/extensions/virtual-tour/1.0": {
      "tourUrl": "https://..."
    }
  }
}
```

Requirements:

- extension key is an absolute URI controlled by the extension owner, or an approved reverse-domain identifier;
- extension value is a JSON object;
- extension schema URI and version are discoverable;
- extension cannot override core meaning;
- extension cannot introduce prohibited private data;
- validators preserve unknown extensions;
- strict conformance may require extension-schema validation when resolvable or locally installed.

## Extension registry

paper&slate may host an informative registry containing:

- namespace;
- owner;
- schema;
- version;
- status;
- license;
- security/privacy review;
- known implementations;
- core-promotion discussion.

Registry inclusion is not endorsement.

## Promotion to core

An extension may be proposed for core after:

- at least two independent implementations;
- documented use cases;
- internationalization review;
- privacy/security review;
- compatibility plan;
- accepted RFC.

## Deprecation

Deprecated fields remain valid for at least the remainder of the major version unless a security issue requires faster action.

Every deprecation identifies:

- replacement;
- first deprecated version;
- planned removal major version;
- migration example;
- linter warning code.

## Migration tooling

The CLI should support:

- `eom migrate --from 1.0 --to 1.1`;
- dry run;
- machine-readable change report;
- preservation of unknown extensions;
- no loss of unsupported fields without explicit warning;
- migration fixture tests.
