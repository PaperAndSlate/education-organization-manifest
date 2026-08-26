# Governance Model

## Stewardship

paper&slate is the initial steward and change controller.

The protocol name and technical work are neutral. Stewardship does not grant paper&slate ownership of school-published data.

## Governance bodies

At project launch:

### Maintainers

Responsible for repository health, releases, review, and implementation.

### Specification editors

Responsible for normative prose, schemas, compatibility, and issue resolution.

### Security contacts

Handle private vulnerability reports and coordinated disclosure.

### Community reviewers

Contributors with recognized expertise in schools, international education, privacy, accessibility, standards, and implementation.

As adoption grows, create an advisory council with school, district, vendor, developer, and international representation.

## Decision types

### Editorial

No semantic effect. Maintainer approval.

### Implementation

Reference tooling behavior without protocol change. Code review and ADR if architectural.

### Compatible protocol change

Optional field/module/vocabulary addition. RFC required.

### Breaking protocol change

Major-version RFC, migration plan, interoperability evidence, and formal approval.

### Security emergency

Maintainers may issue a narrow patch and temporary guidance, followed by public RFC/retrospective where safe.

## Decision principles

- public rationale;
- documented dissent;
- backward compatibility;
- international review;
- privacy and safety;
- implementability;
- no vendor favoritism;
- avoid central dependency;
- testable conformance.

## Voting/consensus

Prefer rough consensus. If unresolved:

- editor prepares options;
- maintainers record positions;
- designated governance lead makes a decision;
- rationale and dissent are published;
- appeal path through a governance issue.

Do not let indefinite consensus block security fixes.

## Change controller

IANA registration must name the actual legal or accountable paper&slate entity and durable contact. Maintain succession and domain-control procedures.

## Transparency

Publish:

- meeting notes when meetings occur;
- accepted/rejected RFCs;
- roadmap;
- release notes;
- conflicts of interest;
- conformance policy;
- security advisories;
- financial/vendor sponsorship disclosures relevant to governance.

## Data governance boundary

This governance covers the standard and reference tools. It does not govern facts published by independent schools. Corrections to a school's data go to that publisher or the future index correction process.
