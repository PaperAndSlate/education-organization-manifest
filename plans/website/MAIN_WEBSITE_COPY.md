# Recommended Main Website Copy

This document provides draft copy and page structure for `paperandslate.org`. It is not the protocol specification.

## Placement on paperandslate.org

Recommended top-level navigation:

```text
Projects
  Educational Organization Manifest
  Education Data API           future
  Educational Content Format   future

Tools
  Validator
  Manifest Explorer
  Starter Generator
  Schema Browser

Developers
  Documentation
  GitHub
  Specifications
  Governance
```

Recommended canonical project page:

`https://paperandslate.org/projects/eom`

Recommended documentation:

`https://eom.paperandslate.org/`

Recommended stable specification namespace:

`https://paperandslate.org/spec/eom/`

Recommended schema namespace:

`https://paperandslate.org/schemas/eom/`

The protocol must remain usable if these presentation pages move. Published immutable versioned specification/schema URLs require long-term redirect and archival commitments.

## Homepage project card

### Title

Educational Organization Manifest

### Description

A proposed open standard for publishing trustworthy, machine-readable information about schools and other educational organizations from their own web domains.

### Action

Explore the standard

### Status label

Working Draft

Do not use “IANA registered,” “official web standard,” or “production standard” until those claims are factually supported.

## Project page hero

### Eyebrow

An open protocol stewarded by paper&slate

### Headline

Give educational information a reliable home on the web.

### Supporting copy

The Educational Organization Manifest is a proposed open standard that lets schools, districts, colleges, universities, and training providers publish public information in a consistent, machine-readable form—starting from one well-known address on their own domain.

### Primary action

Read the documentation

### Secondary action

Validate a manifest

### Tertiary link

View the Ecme High example

## Problem section

### Heading

School information exists. It is rarely structured the same way twice.

### Copy

Course catalogs, calendars, programs, departments, policies, menus, transportation details, jobs, and public statistics are spread across websites, PDFs, portals, and vendor systems. Every new website, app, search tool, or public dataset has to interpret them again.

EOM provides a shared discovery and data layer. An organization publishes a small manifest at a predictable address, then links to the public resources it supports.

## How it works

### 1. Publish one entry point

A school or district places an EOM manifest at:

`/.well-known/educational-organization-manifest`

### 2. Link the available resources

The manifest identifies the organization, declares supported capabilities, and points to modules such as courses, calendars, departments, events, and menus.

### 3. Reuse the same public data

Websites, course catalogs, applications, search tools, research systems, and AI agents can consume the same reviewed information without treating a scraped page as the source of truth.

## Benefits section

### For schools

Maintain public information in a reusable structure, retain authority on your own domain, and reduce duplicated updates across websites and systems.

### For developers

Discover educational organization data through a predictable, versioned interface with schemas, validation, provenance, and conformance tests.

### For vendors

Publish or consume individual modules without taking ownership away from the school. EOM supports explicit delegated resources and modular integration.

### For the public

Make course and school information easier to find, compare, translate, reuse, and keep current while preserving where each claim came from.

## What can be published

Suggested copy:

EOM is modular. An organization can publish only a basic profile or add richer public resources over time:

- campuses and departments;
- courses, offerings, programs, and pathways;
- calendars, events, news, sports, and clubs;
- staff directories and role-based contacts;
- facilities, services, policies, and admissions information;
- transportation, meal menus, jobs, and public aggregate statistics;
- API and service discovery.

Every module is optional unless a selected conformance profile says otherwise.

## Privacy section

### Heading

Public institutional data—not student records.

### Copy

EOM is intentionally not a student information format. It excludes individual grades, attendance, schedules, discipline, disability, medical, safeguarding, and other private student records. Named staff information is optional and should appear only when the organization has deliberately chosen to publish it.

## Authority section

### Heading

The organization remains the authority.

### Copy

paper&slate stewards the specification and may provide tools and a future convenience index. The school's or district's own web origin identifies which resources are authoritative. Vendors and departments can maintain delegated modules without turning a central service into the owner of the data.

## Open-source section

### Heading

Open specifications. Open tooling. Independent implementations.

### Copy

The project is designed to include public schemas, reference libraries, a validator, a generator, a command-line interface, conformance fixtures, governance records, and a complete fictional implementation. Any organization or vendor should be able to implement EOM without using a paper&slate product.

### Actions

View on GitHub  
Read the governance process  
Review the roadmap

## Working-draft notice

The Educational Organization Manifest and its proposed well-known URI are under development and public review. The well-known suffix must not be described as registered until the applicable IANA process is complete. Early implementations should be treated as pilots and should follow the versioned draft documentation.

## FAQ copy

### Does a school need to publish every module?

No. The root manifest advertises the capabilities and resources the organization supports. A small school can begin with a profile and course catalog.

### Does paper&slate own the school's data?

No. The publishing organization controls its authoritative origin and decides what public information to expose. Licensing and reuse terms remain explicit.

### Is this an SIS or LMS standard?

No. EOM focuses on deliberately public institutional information and discovery. It can link or map to existing education systems without replacing private operational standards.

### Can a vendor publish a module?

Yes, when the organization's root manifest explicitly delegates the resource and scope.

### Can this generate a school website?

EOM can serve as the structured public-data layer for a website, catalog, API, PDF, or other tool. The website product is a separate implementation.

### Can AI generate the data?

Agent tools may extract candidates from approved websites and documents, record evidence and confidence, and open a review. Direct publication is disabled by default.

## Footer attribution

Educational Organization Manifest is an open protocol stewarded by paper&slate.

Use “stewarded by,” not “powered by,” in the protocol documentation. “Powered by” may be appropriate only for a specific paper&slate product.
