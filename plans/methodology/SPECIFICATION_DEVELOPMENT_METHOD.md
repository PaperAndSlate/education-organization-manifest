# Specification Development Method

## Principles

- solve demonstrated interoperability problems;
- reuse existing web/education standards;
- keep a small mandatory core;
- make optional modules independently implementable;
- specify failure behavior;
- test normative language;
- include security/privacy/internationalization from the first draft;
- publish decisions and dissent.

## Workflow

```text
problem statement
→ issue/use cases
→ prior-art research
→ RFC
→ prototype schemas
→ two implementation experiments
→ security/privacy review
→ conformance fixtures
→ public review
→ approval
→ immutable release
```

## Normative language

The final specification may use RFC 2119/8174 key words only where requirements are genuinely normative and testable.

Each MUST/SHOULD should map to:

- requirement ID;
- schema/semantic rule or documented non-automatable review;
- conformance coverage;
- rationale.

## Field admission test

Before adding a core field, answer:

1. Is it public institutional information?
2. Is the concept common across more than one implementation?
3. Is there an existing standard/reference?
4. Can it be optional or an extension?
5. Who is the natural authority?
6. What are privacy/security risks?
7. What are international variants?
8. How does it version?
9. Can it be tested?
10. Does Ecme High demonstrate it?

## Breaking change analysis

Consider syntax and semantics. A change can be breaking even if old JSON still validates.

## External review

Seek review from:

- school/district administrators;
- course catalog/curriculum staff;
- education data specialists;
- accessibility/internationalization reviewers;
- vendors;
- privacy/security specialists;
- independent implementers.

Record review evidence; do not claim endorsement.
