# Interoperability

EOM adapters help a publisher turn an existing public export into reviewable authoring input. They are intentionally conservative: the adapter reports what was mapped, what was approximate, and what was omitted, then leaves publication to the normal owner-review and deterministic generator workflow.

## Try a local mapping

The CLI accepts only an explicit local file. It does not fetch source URLs or write a publication:

```bash
pnpm eom map schema-org-jsonld fixtures/mappings/schema-org.json --json
pnpm eom map qti-xml fixtures/mappings/qti-public.xml --json
```

The result is always `publication: "candidate-only"`. Generated claims identify the mapping method, source locator, observation time, loss report, and pending owner review. A privacy or active-content finding produces a quarantine result and never echoes the rejected input.

## Mapping registry

The complete versioned registry is [`mappings/registry.json`](../mappings/registry.json). It covers Schema.org, CEDS, Ed-Fi, OneRoster, CASE, QTI, LTI, Common Cartridge, iCalendar, and JSON Feed/RSS/Atom. Every entry includes an allowlist, transformations, exact/approximate/omitted fields, provenance behavior, fixture, and an explicit `certificationClaim: false`.

The [normative interoperability section](../spec/1.0/interoperability.md) explains the safety boundary and why source identifiers, standards frameworks, package contents, and private administrative data are not collapsed into the EOM model.

All fixtures are fictitious and local. They use reserved example domains and contain no student, staff-private, credential, or other person-level data.
