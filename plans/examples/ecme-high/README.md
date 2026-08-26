# Ecme High School Reference Example

Ecme High School is a wholly fictitious American public high school created solely to demonstrate the Educational Organization Manifest. It is not based on a real school.

All of the following are synthetic:

- organization and district;
- addresses;
- identifiers;
- people;
- courses and programs;
- events and dates;
- vendors;
- domains;
- statistics;
- transportation and meal information.

All web origins use the reserved `.example` top-level domain. Do not replace them with real organizations in conformance fixtures.

## Fictional identity

- School: Ecme High School
- Governing organization: Ecme Public Schools
- School type: public secondary school
- Fictional location: Example City, Iowa, United States
- Education levels: grades 9–12
- Default language: English (`en-US`)
- Additional sample language: Spanish (`es`)
- School origin: `https://ecme-high.example`
- District data origin: `https://district.ecme.example`
- Meal vendor origin: `https://menus.school-services.example`

## Why the example is rich

Ecme High should exercise every v1 module and several complex protocol behaviors:

- school plus governing district;
- one primary campus;
- multilingual values;
- departments with separate source owners;
- a substantial course catalog;
- course definitions separate from offerings and sections;
- programs/pathways;
- calendars and events;
- facilities/services/policies/admissions;
- sports and clubs;
- district-hosted transportation;
- vendor-hosted meal menus;
- jobs/news/statistics/API references;
- field provenance;
- explicit scoped delegation;
- optional signatures;
- conformance report;
- Schema.org projection;
- generated website/catalog preview.

## Source and expected output

`source-sample/` illustrates how a school might author modular YAML.

`expected-sample/` illustrates generated canonical resources. These files are planning examples, not final normative fixtures. Codex must regenerate them from the implemented schemas and remove or revise any field that does not survive specification review.

## Required banners

Every rendered page and README should display:

> Ecme High School is fictional. All data and people shown are synthetic.

The fixture must never use a real NCES, state, district, accreditation, tax, phone, street, or postal identifier.

## Example goals

The example should be:

- realistic enough to test websites and course catalogs;
- complex enough to test ownership and delegation;
- safe to publish and redistribute;
- deterministic;
- complete enough to explain every v1 module;
- clearly distinguishable from an actual school.
