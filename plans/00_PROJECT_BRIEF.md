# Project Brief

## Working title

**Educational Organization Manifest (EOM)**

## Steward

**paper&slate**  
Canonical steward domain: `https://paperandslate.org`

## Proposed well-known endpoint

`/.well-known/educational-organization-manifest`

## Problem

Public information about educational organizations is fragmented across HTML pages, PDFs, inaccessible course catalogs, proprietary systems, government datasets, calendars, feeds, and vendor portals. Each consumer must scrape, infer, normalize, and repeatedly verify the same information. Schools frequently re-enter the same course and organizational information into several disconnected systems.

Existing education interoperability standards often focus on transactional, roster, assessment, learning-platform, or student-record use cases. EOM is deliberately narrower in authority and broader in public discovery: it creates a public, origin-controlled, machine-readable front door for institutional information.

## Mission

Define an open, internationally usable protocol that allows an educational organization to publish public institutional information once and make it discoverable, attributable, verifiable, modular, and reusable by websites, search engines, public datasets, AI systems, catalog generators, educational applications, and government or research tools.

## Core proposition

An organization controls an HTTPS origin. That origin publishes one compact manifest at a registered well-known URI. The manifest establishes:

- who the publisher is;
- which educational organizations are represented;
- the scope of the declaration;
- which resource documents are authoritative;
- which capabilities and modules are available;
- who maintains or is delegated authority over each resource;
- how clients can validate, cache, verify, and interpret the resources;
- which specification version and extension namespaces apply.

## Primary users

### Publishers

- individual schools;
- school districts and multi-academy trusts;
- colleges and universities;
- vocational and technical providers;
- online schools;
- education authorities;
- vendors authorized to generate resources for an organization.

### Consumers

- school websites and course-catalog systems;
- educational search and discovery applications;
- foundation-run indexes and public APIs;
- AI assistants and agents;
- curriculum and planning applications;
- government and research systems;
- accessibility and translation tools;
- developers integrating public school information.

### Maintainers

- school administrators;
- curriculum directors;
- department chairs;
- communications teams;
- transportation, food-service, athletics, and HR teams;
- authorized technology vendors;
- district and foundation data teams.

## First-release positioning

The first stable release is **school-focused**, but the type system must structurally support all educational organizations. The examples and conformance profile should emphasize K–12 schools and districts without hard-coding U.S.-specific assumptions into the protocol core.

## Deliverables

The repository must eventually contain:

- normative protocol specification;
- JSON Schemas using JSON Schema 2020-12;
- source authoring conventions for YAML and JSON;
- generated TypeScript types;
- validator and semantic linter;
- deterministic source-to-publication generator;
- CLI;
- optional integrity and signature support;
- conformance suite and fixtures;
- Ecme High School reference implementation;
- documentation and interactive tools;
- governance and RFC process;
- IANA registration package;
- import/export adapter architecture;
- agentic extraction and update prompts;
- security, privacy, provenance, and internationalization guidance.

## Success criteria

The project is successful when:

1. A small school can publish a basic conforming manifest without adopting a new platform.
2. A large district can delegate modules to different teams and vendors without losing root authority.
3. A consumer can discover, validate, cache, and interpret data without custom school-specific scraping.
4. A course catalog can distinguish reusable course definitions from term-specific offerings.
5. Every important claim can carry provenance and effective dates.
6. No private student data is required or encouraged.
7. The same source data can generate a website, catalog, printable document, API, Schema.org projection, and EOM resources.
8. Independent implementations can pass a public conformance suite.
9. The protocol can evolve through namespaced extensions without uncontrolled top-level fields.
10. paper&slate can operate a convenience index without becoming the source of authority for school-published facts.

## Explicit non-goals for v1

- student records or rostering;
- gradebook or assessment-result exchange;
- authentication or authorization for private education systems;
- replacing OneRoster, Ed-Fi, CEDS, CASE, QTI, LTI, Common Cartridge, or Schema.org;
- defining a school website CMS;
- requiring cryptographic signatures;
- guaranteeing truth merely because a resource validates;
- centrally assigning every educational organization identifier;
- storing private or operationally sensitive data.
