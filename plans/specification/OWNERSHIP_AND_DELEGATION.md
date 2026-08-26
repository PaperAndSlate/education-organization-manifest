# Ownership and Delegation

## Two separate concepts

### Source ownership

Who may edit or approve authoring files in a repository.

### Publication authority

Who may publish an authoritative resource for an organization.

These must never be conflated.

## Source ownership model

Recommended source layout:

```text
source/
  organization/
  departments/
    mathematics/
    science/
    fcs/
  courses/
    mathematics/
    science/
    fcs/
  transportation/
  meals/
  athletics/
```

Example CODEOWNERS:

```text
/source/organization/**              @school-admin @district-data
/source/departments/mathematics/**  @math-chair @curriculum-director
/source/courses/mathematics/**      @math-chair @curriculum-director
/source/departments/fcs/**          @fcs-chair @curriculum-director
/source/courses/fcs/**              @fcs-chair @curriculum-director
/source/transportation/**           @transportation-team @district-data
/source/meals/**                    @food-services @district-data
/source/athletics/**                @athletics-director @communications
/schemas/**                         @eom-schema-maintainers
/spec/**                            @eom-spec-maintainers
```

Branch rules should require relevant CODEOWNERS approval and central publication review for privacy-sensitive modules.

## Merge policy

The generator must not resolve conflicting source ownership through arbitrary file order.

Each object requires a stable ID. Duplicate IDs produce an error unless an explicit overlay policy exists.

Allowed composition patterns:

- one file defines one object;
- a catalog index includes object files;
- an approved overlay changes a documented set of paths;
- generated external imports live in a separate namespace and do not overwrite manual claims silently.

## Root delegation

A delegation grants another party authority over a limited publication scope.

Proposed object:

```json
{
  "id": "https://ecme-high.example/id/delegation/meal-provider",
  "delegate": {
    "id": "https://vendor.example/id/organization",
    "name": "Example Food Services"
  },
  "scope": {
    "resourceTypes": ["meal-menu-catalog"],
    "resourceIds": [
      "https://ecme-high.example/id/resource/meal-menu"
    ],
    "allowedOrigins": [
      "https://menus.vendor.example"
    ],
    "allowedPathPrefixes": [
      "/customers/ecme-high/"
    ]
  },
  "keys": [
    "https://ecme-high.example/eom/keys#vendor-meals-2027"
  ],
  "validFrom": "2027-07-01T00:00:00Z",
  "validUntil": "2028-06-30T23:59:59Z",
  "transitive": false,
  "status": "active"
}
```

## Delegation validation

A consumer verifies:

1. the delegation is present in the root manifest or a root-authorized resource;
2. the resource type and ID are in scope;
3. the final URL origin/path is in scope;
4. the delegation is temporally valid;
5. the delegation is active and not revoked;
6. any signature uses an allowed key;
7. the resource subject matches an organization represented by the manifest.

## Cross-origin without signatures

V1 allows explicit cross-origin resources without signatures because HTTPS plus root linking may be sufficient for many deployments.

Consumers should label trust as:

- root-linked;
- delegated;
- signed;
- signed-and-delegated;
- mirrored;
- unverified external.

## Transitive delegation

Default: forbidden.

Future delegated sub-authority requires an explicit capability and maximum depth. V1 tooling should reject `transitive: true` unless an experimental profile is enabled.

## Revocation

A root manifest may revoke a delegation by:

- setting `status: revoked`;
- removing it and publishing a signed/dated revocation list;
- expiring it;
- removing allowed keys;
- linking a successor delegation.

Consumers and indexes should preserve historical revocation evidence.

## Vendor change

When a school changes vendors:

- old resource remains historical;
- delegation end date is recorded;
- new delegation gets a new ID;
- root points to the new canonical resource;
- consumers should not treat the vendor domain as school identity.

## Approval matrix

At minimum:

| Module | Source owner | Required approver | Privacy review |
|---|---|---|---|
| Organization | School admin | District/publication owner | Yes |
| Courses | Department | Curriculum owner | Usually |
| Staff | HR/comms | Publication owner | Mandatory |
| Transportation | Transport | District data | Mandatory |
| Meals | Food services/vendor | Publication owner | Yes |
| Sports/clubs | Activity owner | Communications | Yes |
| Jobs | HR | HR/publication owner | Yes |
| Statistics | Data team | Data governance | Mandatory |

The exact matrix belongs in deployment configuration, not the wire protocol.
