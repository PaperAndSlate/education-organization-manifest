# Implementation Principles

## 1. Authority begins at the origin

An HTTPS origin controls its well-known resource. A central index, vendor, search engine, or paper&slate service may observe and redistribute data, but cannot replace the origin's authority.

## 2. Discovery is not a data dump

The root manifest should remain small and stable. Large collections belong in linked resources or indexes. A district with hundreds of schools must not need a multi-megabyte root document.

## 3. Public by design, private by exclusion

Every field must be evaluated as information that could be globally cached forever. The specification must prohibit student-level data and provide strong linting for accidental personal or operational leakage.

## 4. Minimal core, rich optional modules

A small school should be able to publish a useful profile quickly. A district may implement every module. Capability discovery tells clients what is available.

## 5. One concept, one stable identifier

Resources and entities should use absolute, stable URIs. External identifiers remain namespaced and are not flattened into ambiguous strings.

## 6. Course is not offering

A course describes an educational offering concept. An offering describes when, where, how, and by whom that course is made available. A section may be a specific subdivision of an offering.

## 7. Structure is separate from presentation

The protocol describes information, not website layout. The same data can render as HTML, PDF, JSON-LD, a catalog, a mobile UI, or an API response.

## 8. Provenance is first-class

Validation proves shape, not truth. Clients need to know who asserted a value, from which source, when it was observed, how it was transformed, and when it applies.

## 9. Conflict is data

When authoritative-looking sources disagree, retain the competing claims or record the conflict. Never hide uncertainty through a silent last-write-wins merge.

## 10. Human review remains the publication gate

Agents can collect and normalize data. By default they create reviewable candidates and pull requests. They do not directly publish institutional facts.

## 11. Deterministic generation

The same source inputs, tool version, and configuration must produce byte-identical canonical JSON, excluding explicitly separate non-deterministic build reports.

## 12. International core, jurisdiction profiles

Do not hard-code state, ZIP code, GPA, grade 12, Carnegie unit, term type, or district into universal fields. Use neutral structures and jurisdiction profiles.

## 13. Extensions are explicit and namespaced

No arbitrary unknown top-level fields. Extensions live under a controlled namespace with declared schemas, owners, versions, and compatibility expectations.

## 14. Existing standards are collaborators, not targets to replace

Map to Schema.org, CEDS, Ed-Fi, and 1EdTech where useful. Keep EOM focused on public discovery and publication.

## 15. Secure consumers, not only secure publishers

Crawlers and validators fetch untrusted URLs. Implement SSRF protection, redirect limits, response size limits, content-type checks, decompression limits, timeouts, and safe parser behavior.

## 16. Accessibility is part of interoperability

Documentation, generated examples, website tools, and rendered course catalogs must meet modern accessibility expectations. Text fields should support language and direction metadata. Media links should allow accessibility metadata.

## 17. Stable URLs and immutable historical specs

Released schema and specification URLs must remain available. `latest` aliases may move, but versioned URLs must not.

## 18. Conformance is testable

Claims such as “EOM compatible” must correspond to a named profile and a machine-readable conformance report.

## 19. Graceful partial adoption

A valid basic manifest is better than no manifest. Missing optional modules are not failures. Clients must not infer that an omitted field is false.

## 20. No runtime lock-in

Validation and generation must work offline. The protocol must not require calls to paperandslate.org to parse a locally cached document, although canonical schemas and registries may be mirrored there.
