# Foundation RFC Process

## When an RFC is required

- new core field;
- new core module;
- new conformance profile;
- semantic meaning change;
- extension promotion;
- signature/security change;
- versioning policy change;
- IANA/media/link registration;
- breaking API/schema change;
- governance change.

## RFC states

- idea;
- draft;
- review;
- accepted;
- rejected;
- withdrawn;
- implemented;
- superseded.

## RFC template

- title;
- authors;
- status;
- created/updated;
- summary;
- motivation;
- use cases;
- non-goals;
- proposed data model/protocol;
- examples;
- alternatives;
- compatibility;
- migration;
- security;
- privacy;
- internationalization;
- accessibility;
- provenance;
- conformance/tests;
- implementation plan;
- unresolved questions;
- decision and rationale.

## Process

1. open discussion issue;
2. identify real use cases;
3. draft RFC under `spec/rfcs/`;
4. assign editor and reviewers;
5. prototype where useful;
6. add fixtures/tests;
7. public review period;
8. revise;
9. decision;
10. implement;
11. mark implemented in release.

## Review periods

Suggested:

- normal compatible change: 14 days;
- substantial/breaking change: 30 days;
- governance change: 30 days;
- security emergency: shortened with later review.

## Acceptance criteria

- clear problem;
- not better solved by an existing standard/reference;
- international abstraction;
- privacy/security reviewed;
- backwards compatibility understood;
- testable;
- at least one implementation plan;
- no unnecessary mandatory fields.

## Rejection is not deletion

Rejected RFCs remain for historical context.

## Experimental features

Accepted as experimental when:

- namespace/profile isolated;
- not required for stable conformance;
- expiration/review date set;
- implementation evidence planned.

## Editing discipline

An accepted RFC authorizes work; it does not override errors found during implementation. Material deviations return to RFC review.
