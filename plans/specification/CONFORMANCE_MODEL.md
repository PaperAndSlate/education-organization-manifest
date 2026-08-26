# Conformance Model

## Purpose

Conformance must be specific and testable. “EOM compatible” alone is insufficient.

## Conformance roles

### Core Publisher

Publishes a valid root manifest and organization profile.

### School Publisher

Meets the school-focused profile and privacy rules.

### District Publisher

Publishes multiple organizations and relationship/index structures.

### Module Publisher

Conforms for named modules such as Course Catalog or Transportation.

### Signed Publisher

Implements the optional signature profile.

### Delegated Publisher

Implements scoped delegation correctly.

### Consumer

Discovers, validates, resolves, caches, and reports resources according to protocol rules.

### Generator

Produces deterministic, conforming wire resources from source data.

### Validator

Correctly accepts/rejects the conformance fixture suite and reports semantic categories.

## Conformance report

Machine-readable report:

```json
{
  "specification": "https://paperandslate.org/spec/eom/1.0",
  "implementation": {
    "name": "Example Publisher",
    "version": "2.1.0"
  },
  "testedAt": "2027-06-01T00:00:00Z",
  "profiles": [
    {
      "id": "https://paperandslate.org/eom/conformance/core-publisher/1.0",
      "status": "pass"
    }
  ],
  "tests": [],
  "tool": {},
  "signature": null
}
```

## Test categories

- JSON syntax;
- schema validity;
- resource envelope;
- IDs and canonical URLs;
- HTTP behavior;
- redirects;
- CORS/cache headers;
- reference resolution;
- capability/resource consistency;
- delegation scope;
- language rules;
- dates and lifecycle;
- provenance pointers;
- privacy lint;
- deterministic generation;
- signatures;
- extension preservation;
- migration.

## Valid fixtures

Include:

- minimal school;
- rich school;
- district multi-school;
- path-scoped school;
- multilingual school;
- delegated vendor;
- signed school;
- chunked catalog;
- closed/renamed school;
- expired resource with valid historical status.

## Invalid fixtures

Include one clear violation per fixture plus compound adversarial fixtures:

- missing protocol version;
- relative entity ID;
- duplicate IDs;
- unknown top-level property;
- unnamespaced extension;
- dangling resource reference;
- course offering without course;
- invalid language tag;
- default language absent from multilingual value;
- delegation outside origin/path;
- expired/revoked signing key;
- student record leakage;
- secret pattern;
- invalid provenance pointer;
- redirect loop;
- oversized/decompression bomb simulation.

## Badge language

Possible public statements:

- “Conforms to EOM 1.0 Core Publisher Profile”
- “Conforms to EOM 1.0 Course Catalog Module”
- “Verified against EOM Conformance Suite 1.0 on <date>”

Do not imply paper&slate endorses the organization or verifies factual accuracy.

## Trademark and mark policy

If paper&slate creates a logo or conformance mark:

- publish usage rules;
- require a current passing report;
- prohibit alteration suggesting endorsement;
- provide revocation for false claims;
- keep the protocol implementable without using the mark.

## Independent interoperability

Before v1.0:

- one publisher implementation;
- one independent consumer;
- preferably a second publisher or validator;
- documented exchange of the same fixtures;
- resolved interpretation differences.

## Version behavior

A conformance report is tied to:

- specification version;
- profile version;
- test-suite version;
- implementation version;
- test time.

Old reports remain historical and must not be silently relabeled current.
