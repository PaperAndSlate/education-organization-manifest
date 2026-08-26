# Confirmed Product and Protocol Decisions

This document records the user's approved decisions and must be treated as authoritative unless superseded by a formally accepted repository RFC.

## Identity and scope

- Use a neutral protocol name.
- Model all educational organizations structurally.
- Position the first release as school-focused.
- Support district-level and multi-organization publication.
- Keep the school website/CMS product in a separate repository.

## Discovery

- Use one well-known entry point.
- The root resource is compact and focused on identity, authority, discovery, capabilities, versioning, delegation, and links.
- Use canonical JSON for published resources.
- Permit YAML as a human-friendly source authoring format.
- Use JSON Schema as the normative validation mechanism.
- Do not use Markdown as a data serialization.

## Modules

Version 1 planning includes optional modules for:

- organization profiles;
- campuses;
- departments;
- staff directory;
- contacts;
- courses;
- offerings and sections;
- programs and pathways;
- academic calendars;
- events;
- facilities;
- services;
- policies and documents;
- admissions and enrollment information;
- sports teams;
- transportation;
- lunch menus;
- clubs;
- jobs;
- news;
- public aggregate statistics;
- API and service discovery.

The core remains small. Modules are separately versioned and linked.

## Course modeling

- Design the course model deeply from the beginning.
- Most detailed properties are optional.
- Distinguish a reusable course definition from a time/location/instructor-specific course offering.
- Keep live scheduling, live availability, and enrollment-state information in an optional offering/availability layer rather than the required catalog core.

## Ownership and delegation

- The web origin remains the root authority.
- Source files may have separate owners using repository structure, CODEOWNERS, and approval rules.
- The manifest may delegate specific resource types or resource instances to another team, origin, or vendor.
- Cross-origin resources are allowed only through explicit delegation or authoritative linking.
- Design signature support now, but signatures remain optional in v1.
- Non-transitive delegation is the default.

## Privacy

- Staff members may be represented only when deliberately published.
- Prefer role-based contacts over personal contacts.
- Explicitly prohibit student-level data.
- Require privacy review, stale-data handling, and publication-expiry support.

## Provenance

- Support resource-, object-, and field-level provenance.
- Preserve source and transformation history.
- Use the agreed precedence model:
  1. authoritative government identity identifiers;
  2. organization-published current operational information;
  3. authoritative public government datasets;
  4. foundation-derived or inferred enrichment.
- Never silently discard conflicting claims; preserve conflict metadata and evidence.

## Website and downstream products

- The future school website product is separate.
- The same structured source may generate:
  - a website;
  - course catalog;
  - printable catalog;
  - EOM resources;
  - public JSON API;
  - Schema.org markup;
  - AI-readable exports;
  - embedded widgets;
  - other school tools.
- A CMS-like editor is possible but not yet committed.

## Agentic generation

Agents may consume:

- existing websites;
- PDF course catalogs;
- handbooks;
- calendars;
- government records;
- district sites;
- JSON and CSV;
- SIS exports that contain only approved public fields;
- Google Drive documents;
- manual questionnaires.

Agent changes must not publish directly by default. The expected path is extraction, evidence capture, candidate generation, validation, pull request, and human review.

Internally retain:

- evidence excerpts or locators;
- source URI and retrieval time;
- extraction method;
- confidence;
- review status;
- unresolved conflicts.

Include a prompt library and repository-level agent instructions.

## Versioning and extensions

- Use semantic versioning.
- Major versions may break compatibility.
- Minor versions add backwards-compatible capabilities.
- Patches clarify or correct without changing valid meaning.
- Unknown top-level properties are not allowed.
- Extensions live in a namespaced `extensions` object.
- Extension identifiers must be absolute URIs or reverse-domain-style identifiers controlled by the extension owner.

## Internationalization

- International from the first release.
- Avoid U.S.-specific field names in the core.
- Support BCP 47 language tags.
- Support multilingual values and text direction.
- Use profiles and vocabularies for jurisdiction-specific education levels, credits, grades, and governance.

## Example

Create a rich, explicitly fictitious American public high-school example:

- Ecme High School;
- Ecme Public Schools;
- reserved `.example` domains;
- multiple departments;
- a substantial course catalog;
- offerings;
- all v1 modules;
- delegated ownership examples;
- no real identifiers or personal data.

## Licensing and governance

Recommended licensing:

- code, schemas, tests, and generated SDK types: Apache-2.0;
- specification and documentation: CC BY 4.0;
- example data and public factual vocabularies: CC0 1.0.

Use an open RFC process, semantic change control, conformance tests, and foundation stewardship.

## Foundation index

A future paper&slate service may crawl and index manifests and expose a public convenience API. The school or organization origin remains authoritative. The index must retain provenance, observation time, and source snapshots.

## Capabilities

The manifest explicitly advertises supported modules and capabilities. A minimal publisher does not need to implement every module.
