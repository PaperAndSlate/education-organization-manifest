# Pack Index

## Purpose

This index explains the implementation-planning pack and provides a complete file inventory. The machine-readable `pack-manifest.json` adds sizes and SHA-256 checksums.

## Recommended reading order

1. `README.md`
2. `OPERATOR_HANDOFF.md`
3. `00_PROJECT_BRIEF.md`
4. `01_CONFIRMED_DECISIONS.md`
5. `02_NAMING_DECISION.md`
6. `03_REPOSITORY_BLUEPRINT.md`
7. `04_IMPLEMENTATION_PRINCIPLES.md`
8. `specification/PROTOCOL_OVERVIEW.md`
9. `delivery/PHASES_AND_MILESTONES.md`
10. `delivery/DEFINITION_OF_DONE.md`
11. `CODEX_EXECUTION_PLAYBOOK.md`
12. `MASTER_CODEX_GOAL_PROMPT.txt`

## Contents by area

### Core

Core brief, decisions, naming, roadmap, and Codex execution entry points.

- `00_PROJECT_BRIEF.md`
- `01_CONFIRMED_DECISIONS.md`
- `02_NAMING_DECISION.md`
- `03_REPOSITORY_BLUEPRINT.md`
- `04_IMPLEMENTATION_PRINCIPLES.md`
- `05_GLOSSARY.md`
- `06_SOURCE_RESEARCH.md`
- `CODEX_EXECUTION_PLAYBOOK.md`
- `MASTER_CODEX_GOAL_PROMPT.txt`
- `OPERATOR_HANDOFF.md`
- `PACK_INDEX.md`
- `PACK_VALIDATION_REPORT.md`
- `README.md`
- `pack-manifest.json`
- `roadmap.md`

### Specification

Proposed protocol behavior and normative design.

- `specification/CONFORMANCE_MODEL.md`
- `specification/HTTP_AND_DISCOVERY.md`
- `specification/IANA_REGISTRATION_PLAN.md`
- `specification/IDENTIFIERS_AND_SCOPE.md`
- `specification/INTERNATIONALIZATION.md`
- `specification/OWNERSHIP_AND_DELEGATION.md`
- `specification/PRIVACY_AND_PUBLICATION.md`
- `specification/PROTOCOL_OVERVIEW.md`
- `specification/PROVENANCE_AND_CONFLICTS.md`
- `specification/RESOURCES_AND_CAPABILITIES.md`
- `specification/ROOT_MANIFEST.md`
- `specification/SIGNATURES_AND_INTEGRITY.md`
- `specification/VERSIONING_AND_EXTENSIONS.md`

### Data Model

Module and shared data-model plans.

- `data-model/ADMISSIONS_AND_ENROLLMENT.md`
- `data-model/API_AND_SERVICE_DISCOVERY.md`
- `data-model/CALENDARS_EVENTS_AND_NEWS.md`
- `data-model/COMMON_TYPES.md`
- `data-model/COURSES.md`
- `data-model/DATA_MODEL_OVERVIEW.md`
- `data-model/DEPARTMENTS_CONTACTS_AND_STAFF.md`
- `data-model/FACILITIES_SERVICES_AND_POLICIES.md`
- `data-model/JOBS.md`
- `data-model/MEALS_AND_MENUS.md`
- `data-model/MODULE_REGISTRY.md`
- `data-model/OFFERINGS_AND_SECTIONS.md`
- `data-model/ORGANIZATIONS_AND_CAMPUSES.md`
- `data-model/PROGRAMS_AND_PATHWAYS.md`
- `data-model/SPORTS_AND_CLUBS.md`
- `data-model/STATISTICS_AND_PUBLIC_DATA.md`
- `data-model/TRANSPORTATION.md`
- `data-model/VOCABULARIES_AND_CODE_LISTS.md`

### Architecture

Reference implementation and repository architecture.

- `architecture/CI_CD_AND_RELEASE.md`
- `architecture/CLI_DESIGN.md`
- `architecture/CONFORMANCE_SUITE.md`
- `architecture/DEPENDENCY_AND_SUPPLY_CHAIN_POLICY.md`
- `architecture/DOCUMENTATION_AND_PLAYGROUND.md`
- `architecture/GENERATOR_PIPELINE.md`
- `architecture/MONOREPO_ARCHITECTURE.md`
- `architecture/PERFORMANCE_AND_CACHING.md`
- `architecture/REFERENCE_IMPLEMENTATION.md`
- `architecture/SCHEMA_ENGINEERING.md`
- `architecture/SOURCE_AND_GENERATED_DATA.md`
- `architecture/TESTING_STRATEGY.md`
- `architecture/THREAT_MODEL.md`
- `architecture/VALIDATOR_AND_LINTER.md`

### Governance

Stewardship, RFC/ADR, licensing, security, and conformance governance.

- `governance/ADR_PROCESS.md`
- `governance/CONFORMANCE_MARK_POLICY.md`
- `governance/CONTRIBUTING_PLAN.md`
- `governance/GOVERNANCE.md`
- `governance/LICENSE_AND_IP_PLAN.md`
- `governance/MAINTAINERS_AND_SUCCESSION.md`
- `governance/RFC_PROCESS.md`
- `governance/SECURITY_POLICY_PLAN.md`

### Ownership

Source ownership, review, and delegated hosting.

- `ownership/CODEOWNERS_EXAMPLE.md`
- `ownership/DELEGATED_VENDOR_HOSTING.md`
- `ownership/MULTI_OWNER_WORKFLOWS.md`
- `ownership/REVIEW_AND_APPROVAL_MATRIX.md`

### Agentic

Evidence-led agent workflow and reusable prompts.

- `agentic/AGENTS.md`
- `agentic/EVIDENCE_LEDGER.md`
- `agentic/EXTRACTION_METHODOLOGY.md`
- `agentic/HUMAN_REVIEW_WORKFLOW.md`
- `agentic/PROMPT_CATALOG.md`
- `agentic/prompts/add-courses.txt`
- `agentic/prompts/add-department.txt`
- `agentic/prompts/audit-school-data.txt`
- `agentic/prompts/create-course-catalog.txt`
- `agentic/prompts/create-from-documents.txt`
- `agentic/prompts/create-from-website.txt`
- `agentic/prompts/enrich-from-public-data.txt`
- `agentic/prompts/find-stale-information.txt`
- `agentic/prompts/generate-website-assets.txt`
- `agentic/prompts/implementation/01-bootstrap-repository.txt`
- `agentic/prompts/implementation/02-core-protocol-and-schemas.txt`
- `agentic/prompts/implementation/03-module-schemas-and-ecme.txt`
- `agentic/prompts/implementation/04-generator-validator-cli.txt`
- `agentic/prompts/implementation/05-provenance-and-agent-workflows.txt`
- `agentic/prompts/implementation/06-delegation-and-signatures.txt`
- `agentic/prompts/implementation/07-documentation-and-playground.txt`
- `agentic/prompts/implementation/08-conformance-release-registration.txt`
- `agentic/prompts/migrate-schema.txt`
- `agentic/prompts/privacy-review.txt`
- `agentic/prompts/update-existing-school.txt`
- `agentic/prompts/verify-source-provenance.txt`

### Delivery

Phases, backlog, risks, release gates, and definition of done.

- `delivery/DEFINITION_OF_DONE.md`
- `delivery/ISSUE_BACKLOG.md`
- `delivery/PHASES_AND_MILESTONES.md`
- `delivery/RELEASE_CHECKLIST.md`
- `delivery/REQUIREMENT_TRACEABILITY_TEMPLATE.md`
- `delivery/RISK_REGISTER.md`

### Examples

Ecme High synthetic source, generated planning fixture, and invalid cases.

- `examples/ecme-high/CODEOWNERS.example`
- `examples/ecme-high/COURSE_CATALOG_PLAN.md`
- `examples/ecme-high/DEPLOYMENT_TOPOLOGY.md`
- `examples/ecme-high/EXAMPLE_BLUEPRINT.md`
- `examples/ecme-high/OWNERSHIP_PLAN.md`
- `examples/ecme-high/README.md`
- `examples/ecme-high/VALIDATION_SCENARIOS.md`
- `examples/ecme-high/expected-sample/.well-known/educational-organization-manifest`
- `examples/ecme-high/expected-sample/README.md`
- `examples/ecme-high/expected-sample/delegated/district/jobs.json`
- `examples/ecme-high/expected-sample/delegated/district/transportation.json`
- `examples/ecme-high/expected-sample/delegated/vendor/menus.json`
- `examples/ecme-high/expected-sample/eom/1.0/admissions.json`
- `examples/ecme-high/expected-sample/eom/1.0/api-services.json`
- `examples/ecme-high/expected-sample/eom/1.0/calendar.json`
- `examples/ecme-high/expected-sample/eom/1.0/campuses.json`
- `examples/ecme-high/expected-sample/eom/1.0/clubs.json`
- `examples/ecme-high/expected-sample/eom/1.0/conformance.json`
- `examples/ecme-high/expected-sample/eom/1.0/contacts.json`
- `examples/ecme-high/expected-sample/eom/1.0/courses/cul-202.json`
- `examples/ecme-high/expected-sample/eom/1.0/courses/index.json`
- `examples/ecme-high/expected-sample/eom/1.0/departments.json`
- `examples/ecme-high/expected-sample/eom/1.0/events.json`
- `examples/ecme-high/expected-sample/eom/1.0/facilities.json`
- `examples/ecme-high/expected-sample/eom/1.0/keys.json`
- `examples/ecme-high/expected-sample/eom/1.0/news.json`
- `examples/ecme-high/expected-sample/eom/1.0/offerings.json`
- `examples/ecme-high/expected-sample/eom/1.0/organization.json`
- `examples/ecme-high/expected-sample/eom/1.0/policies.json`
- `examples/ecme-high/expected-sample/eom/1.0/programs.json`
- `examples/ecme-high/expected-sample/eom/1.0/schemaorg.jsonld`
- `examples/ecme-high/expected-sample/eom/1.0/services.json`
- `examples/ecme-high/expected-sample/eom/1.0/sports.json`
- `examples/ecme-high/expected-sample/eom/1.0/staff.json`
- `examples/ecme-high/expected-sample/eom/1.0/statistics.json`
- `examples/ecme-high/invalid-sample/delegation-scope-escape.json`
- `examples/ecme-high/invalid-sample/prerequisite-cycle.json`
- `examples/ecme-high/invalid-sample/private-api-endpoint.json`
- `examples/ecme-high/invalid-sample/staff-without-publication-review.json`
- `examples/ecme-high/invalid-sample/student-record.json`
- `examples/ecme-high/invalid-sample/transitive-delegation.json`
- `examples/ecme-high/source-sample/admissions/profile.yaml`
- `examples/ecme-high/source-sample/apis/services.yaml`
- `examples/ecme-high/source-sample/calendar/2027-2028.yaml`
- `examples/ecme-high/source-sample/campuses/main.yaml`
- `examples/ecme-high/source-sample/clubs/catalog.yaml`
- `examples/ecme-high/source-sample/contacts/roles.yaml`
- `examples/ecme-high/source-sample/courses/fcs/cul-202.yaml`
- `examples/ecme-high/source-sample/delegated/jobs.yaml`
- `examples/ecme-high/source-sample/delegated/meals.yaml`
- `examples/ecme-high/source-sample/delegated/transportation.yaml`
- `examples/ecme-high/source-sample/departments/fcs.yaml`
- `examples/ecme-high/source-sample/eom.config.yaml`
- `examples/ecme-high/source-sample/events/course-selection-night.yaml`
- `examples/ecme-high/source-sample/facilities/culinary-lab.yaml`
- `examples/ecme-high/source-sample/jobs/catalog.yaml`
- `examples/ecme-high/source-sample/news/catalog.yaml`
- `examples/ecme-high/source-sample/organization.yaml`
- `examples/ecme-high/source-sample/policies/catalog.yaml`
- `examples/ecme-high/source-sample/programs/culinary-hospitality.yaml`
- `examples/ecme-high/source-sample/provenance/sources.yaml`
- `examples/ecme-high/source-sample/services/public-services.yaml`
- `examples/ecme-high/source-sample/sports/catalog.yaml`
- `examples/ecme-high/source-sample/statistics/profile.yaml`

### Website

paperandslate.org copy, tools, and future website integration.

- `website/EMBED_EXPORT_STRATEGY.md`
- `website/MAIN_WEBSITE_COPY.md`
- `website/SCHOOL_ADOPTION_GUIDE.md`
- `website/TOOLS_AND_DEVELOPER_PORTAL.md`
- `website/WEBSITE_INTEGRATION_VISION.md`

### Interoperability

Mappings and boundaries with existing standards.

- `interoperability/CEDS_EDFI_MAPPING.md`
- `interoperability/IMPORT_EXPORT_ADAPTERS.md`
- `interoperability/ONE_ROSTER_CASE_QTI_LTI.md`
- `interoperability/SCHEMA_ORG_MAPPING.md`
- `interoperability/STANDARDS_LANDSCAPE.md`

### Adoption

Publisher, consumer, vendor, district, and use-case guidance.

- `adoption/CONSUMER_PATTERNS.md`
- `adoption/PUBLISHING_METHODS.md`
- `adoption/USE_CASES.md`
- `adoption/VENDOR_AND_DISTRICT_INTEGRATION.md`
- `adoption/WHY_EOM_EXISTS.md`

### Methodology

Specification, governance, identity, and data-quality methods.

- `methodology/DATA_GOVERNANCE_METHOD.md`
- `methodology/IDENTIFIER_AND_ENTITY_RESOLUTION_METHOD.md`
- `methodology/SPECIFICATION_DEVELOPMENT_METHOD.md`

### Future

Deferred separate repositories and relationships to future paper&slate projects.

- `future/FOUNDATION_INDEX_AND_API.md`
- `future/RELATIONSHIP_TO_OTHER_PAPER_AND_SLATE_PROJECTS.md`
- `future/SCHOOL_WEBSITE_PLATFORM.md`

### Templates

Reusable RFC, ADR, module, review, and phase templates.

- `templates/ADR_TEMPLATE.md`
- `templates/DATA_REVIEW_CHECKLIST.md`
- `templates/MODULE_SPEC_TEMPLATE.md`
- `templates/PHASE_REPORT_TEMPLATE.md`
- `templates/RFC_TEMPLATE.md`
- `templates/SECURITY_REVIEW_TEMPLATE.md`
