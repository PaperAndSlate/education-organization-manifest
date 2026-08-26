# Documentation Site and Playground

## Goals

- make the standard understandable to non-specialist school staff;
- provide exact normative details to implementers;
- offer interactive validation without requiring an account;
- demonstrate a complete school;
- clearly separate protocol from paper&slate products.

## Suggested stack

Static accessible docs framework with:

- versioned docs;
- full-text search;
- syntax highlighting;
- OpenAPI/JSON Schema integration;
- React/Web Component islands for tools;
- static export;
- good performance and SEO.

Astro Starlight is a strong candidate, subject to current package review.

## Information architecture

### Understand

- What is EOM?
- Why it exists
- How it works
- What it can publish
- Privacy boundary
- Existing standards and EOM

### Publish

- Five-minute minimal school
- District guide
- Department ownership
- Vendor delegation
- Hosting recipes
- Updates and review
- Signatures

### Build

- Specification
- Schema reference
- Resource/module registry
- Consumer guide
- CLI
- TypeScript API
- Adapter guides
- Conformance

### Explore

- Ecme High
- Manifest explorer
- Course catalog preview
- HTTP trace
- Provenance viewer
- Valid/invalid fixtures

### Govern

- Governance
- RFCs
- Roadmap
- Releases
- Security
- License

## Validator modes

- paste JSON/YAML;
- upload file;
- choose fixture;
- enter origin/URL;
- inspect resource graph;
- download report.

For URL mode, use a hardened backend fetch service. Never make the general website server an unrestricted proxy.

## Privacy notice

Before upload/paste:

> EOM is for public institutional data. Do not upload student records, private staff information, secrets, or internal documents.

Prefer client-side validation for pasted files so content need not leave the browser.

## Starter generator

A guided form:

1. organization type;
2. name/domain;
3. identifiers;
4. location/contact;
5. levels/languages;
6. modules;
7. ownership;
8. publication review;
9. generate project or static files.

The wizard must not suggest fictional official identifiers.

## Ecme High explorer

Show:

- root manifest;
- resource graph;
- organization profile;
- course browser;
- provenance;
- ownership map;
- delegated meal/transport resources;
- signature verification;
- generated website preview.

## Accessibility

Target WCAG 2.2 AA.

Include:

- keyboard operation;
- semantic headings;
- visible focus;
- screen-reader findings;
- no color-only status;
- reduced motion;
- accessible code examples;
- text alternatives for graphs;
- RTL testing;
- high zoom/reflow.

## Analytics

Use privacy-respecting analytics or none. Do not log uploaded content. URL validation logs should minimize and expire request data.
