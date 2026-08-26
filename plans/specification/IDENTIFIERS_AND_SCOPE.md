# Identifiers, Identity, and Scope

## Identifier goals

Identifiers must be:

- globally unambiguous;
- stable across file moves;
- dereferenceable when practical;
- independent of a central paper&slate database;
- capable of carrying external authority schemes;
- safe for international use.

## Primary `id`

Every entity and resource should have an absolute URI identifier.

Preferred:

`https://school.example/id/course/culinary-arts-2`

Allowed:

- HTTPS URI controlled by the publisher;
- URN defined by a registered or documented namespace;
- authoritative external URI where the external system defines stable identity.

Discouraged:

- bare integers;
- opaque local strings without a namespace;
- mutable page URLs used as IDs;
- email addresses;
- names as identifiers.

## Canonical versus identifier

`id` identifies the conceptual resource or entity.

`canonical` locates the preferred current representation.

They may be the same URI but should not be assumed identical.

Example:

- course ID: `https://ecme-high.example/id/course/cul-202`
- canonical course representation: `https://ecme-high.example/eom/courses/cul-202.json`

## External identifiers

Use an array:

```json
{
  "identifiers": [
    {
      "scheme": "https://paperandslate.org/registry/identifier-schemes/us-nces-school",
      "value": "123456789012",
      "authority": "https://nces.ed.gov/",
      "status": "verified"
    }
  ]
}
```

The core does not reserve U.S.-specific top-level fields such as `ncesId`.

## Identifier scheme registry

The repository should maintain an informative registry containing:

- scheme URI;
- display name;
- issuing authority;
- jurisdiction;
- format pattern;
- case sensitivity;
- normalization rule;
- verification URL pattern;
- status;
- license/source;
- last reviewed date.

Adding a scheme does not validate that a particular value is authentic.

## Relationships

Identity relationships should distinguish:

- `sameAs`;
- `supersedes`;
- `supersededBy`;
- `previousIdentifier`;
- `approximatelyEquivalentTo`;
- `memberOf`;
- `parentOrganization`;
- `subOrganization`;
- `operatesCampus`.

Never collapse “related” and “same entity.”

## Organization moves and domain changes

A school may change domains or names.

Recommended behavior:

- old origin keeps a permanent redirect when possible;
- old profile points to `supersededBy`;
- new profile lists previous identifiers and domains;
- central indexes preserve identity history;
- consumers do not create a new entity solely because the URL changed.

## Scope rules

The root manifest may claim authority over:

- its own origin;
- explicitly enumerated path scopes on its origin;
- organizations whose canonical profile is linked from its origin;
- delegated resources on other origins.

It may not establish root authority over a third-party origin by assertion alone.

## Multi-school district origin

Use an organization index with:

- district subject;
- member school IDs;
- canonical site URLs;
- profile resource URLs;
- active/closed status;
- effective dates.

Consumers select the relevant organization by exact canonical URL/path, identifier, or explicit page-level `describedby` link.

## Mergers, closures, and renames

Organization profile should support lifecycle:

- planned;
- active;
- temporarily closed;
- closed;
- merged;
- renamed;
- superseded.

A closed school record remains identifiable and may link to a successor.

## Foundation index identifiers

A future paper&slate index may assign an internal opaque record ID for API stability. It must not present that ID as the school's authoritative identity. API responses should expose both the index ID and source IDs.
