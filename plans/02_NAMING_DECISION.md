# Naming and Collision Research

## Selected working name

**Educational Organization Manifest**

Preferred abbreviation: **EOM**

Selected proposed well-known suffix:

`educational-organization-manifest`

Selected endpoint:

`/.well-known/educational-organization-manifest`

Suggested GitHub repository:

`paperandslate/educational-organization-manifest`

Suggested canonical specification base:

`https://paperandslate.org/spec/eom/`

Suggested schema base:

`https://paperandslate.org/schemas/eom/`

## Why this name

The name is intentionally descriptive rather than branded:

- **Educational Organization** covers schools, districts, colleges, universities, training providers, and education authorities.
- **Manifest** accurately describes a compact declaration of identity, authority, capabilities, and linked resources.
- It does not imply that paper&slate operates the school or owns the published data.
- It avoids narrowing the protocol to K–12 even though the first release is school-focused.
- It aligns conceptually with the established Schema.org type `EducationalOrganization` without claiming Schema.org equivalence.
- It is precise enough to avoid a generic `/.well-known/education` or `/.well-known/manifest` namespace claim.

## Collision findings as of 2026-08-25

The IANA Well-Known URIs registry was last updated on 2026-08-19 when researched. It contained no registered suffix beginning with `education`, `educational`, or `school`, and no exact `educational-organization-manifest` entry.

Exact-name web searches did not identify an established technical standard using “Educational Organization Manifest” or the proposed suffix. Search results primarily reflected ordinary-language uses of “manifest,” not a protocol.

This does not guarantee acceptance. The IANA designated expert may request a different name, additional specificity, changes to the specification, or evidence of implementation.

## Alternatives considered

### `education-manifest`

Advantages:

- shorter;
- understandable;
- broadly applicable.

Disadvantages:

- more generic;
- could be interpreted as learning-content, policy, or ideological manifesto;
- less precise under RFC 8615 naming guidance.

### `school-manifest`

Advantages:

- easy to understand;
- strong first-release alignment.

Disadvantages:

- unnecessarily excludes districts, colleges, universities, and training providers;
- creates future renaming pressure.

### `open-education-manifest`

Advantages:

- communicates openness.

Disadvantages:

- overlaps conceptually with the open education and OER movement;
- “open education” may imply content licensing rather than institutional discovery;
- acronym OEM is overloaded.

### `education-site`

Advantages:

- concise;
- emphasizes site-level discovery.

Disadvantages:

- does not clearly communicate that the resource is a manifest;
- “site” can mean campus rather than web origin.

### `edu-org-manifest`

Advantages:

- shorter.

Disadvantages:

- abbreviations reduce clarity;
- less appropriate for a long-lived public registry entry.

## Registration rule

Do not describe the suffix as IANA-registered until it appears in the registry.

The implementation may use the selected suffix in controlled examples and pilot environments. Public v1 deployment guidance must include one of these states:

1. provisional registration accepted;
2. permanent registration accepted; or
3. clearly documented experimental status with no claim of standard registration.

## Protocol branding

Use:

> Educational Organization Manifest  
> An open specification stewarded by paper&slate.

Avoid:

> paper&slate Manifest Format

The stewardship line may appear in documentation and site copy, but the JSON model must not require a paper&slate account, runtime call, API key, or central service.

## Package and command naming

Use scoped packages so package-name collisions do not control the protocol name:

- `@paperandslate/eom-schema`
- `@paperandslate/eom-types`
- `@paperandslate/eom-core`
- `@paperandslate/eom-validator`
- `@paperandslate/eom-generator`
- `@paperandslate/eom-signatures`
- `@paperandslate/eom-testkit`
- `@paperandslate/eom-cli`

Preferred command:

`eom`

Before publishing npm packages, Codex must check current package and executable collisions, document the result, and use a scoped fallback if necessary.

## Primary sources

- IANA Well-Known URIs Registry: https://www.iana.org/assignments/well-known-uris/
- RFC 8615: https://www.rfc-editor.org/rfc/rfc8615
- RFC 9727, an analogous discovery specification: https://www.rfc-editor.org/rfc/rfc9727
- Schema.org EducationalOrganization: https://schema.org/EducationalOrganization
