# Ecme High Example Blueprint

## Organization graph

```text
Ecme Public Schools
└── Ecme High School
    └── Ecme High Main Campus
        ├── English Language Arts
        ├── Mathematics
        ├── Science
        ├── Social Studies
        ├── Family and Consumer Sciences
        ├── Engineering and Technology
        ├── Fine Arts
        ├── World Languages
        └── Physical Education and Health
```

The district and school have distinct IDs. Governance does not make the district origin automatically authoritative for every school resource. The school root explicitly links or delegates district-hosted resources.

## Public profile

Include:

- localized name and description;
- public school classification;
- grades 9–12 through a jurisdiction-aware education-level vocabulary;
- address and approximate public geolocation;
- governing district;
- school website;
- role contacts;
- accessibility information;
- general opening hours;
- languages;
- public identifiers using synthetic schemes;
- correction URL;
- media assets with fictional licenses;
- academic-year context.

## Departments

Each department has:

- stable ID;
- localized title where useful;
- description;
- subjects;
- public role contact;
- course references;
- program references;
- selected facility references;
- ownership metadata in source, not necessarily wire output.

## Course catalog

Target 45–55 course definitions covering:

- semester and year-long courses;
- multiple credit values;
- prerequisite expressions;
- recommended preparation;
- grade eligibility;
- CTE pathways;
- dual-credit-like synthetic examples clearly marked fictional;
- fees/materials;
- delivery modes;
- accessibility notes;
- replacement/retirement history;
- multilingual title example;
- course with no scheduled offering;
- offering available at multiple terms;
- one concrete public section with a deliberately fictional instructor.

## Programs and pathways

At minimum:

- Core Graduation Program;
- Culinary and Hospitality Pathway;
- Engineering Design Pathway;
- Health and Human Services Exploration;
- Fine Arts Concentration;
- World Language Sequence.

The fixture must not claim compliance with a real state graduation law. Use a synthetic local graduation profile or clearly label mappings as illustrative.

## Calendar and events

Create a fictional 2027–2028 academic year:

- first/last day;
- terms;
- holidays;
- teacher workdays;
- exam periods;
- early dismissals;
- open house;
- course-selection night;
- career showcase;
- school play;
- athletics events.

Avoid using dates that could be mistaken for a real schedule without the fiction banner.

## Facilities and services

Facilities:

- main academic building;
- library/media center;
- culinary lab;
- engineering lab;
- science labs;
- auditorium;
- gymnasium;
- athletic field.

Services:

- counseling office as a public service description only;
- library;
- technology support;
- translation/accessibility assistance;
- family resource contact;
- career advising.

Do not model individual counseling records, appointments, access controls, cameras, keys, or security layouts.

## Extended modules

### Sports

Sample teams, public schedules, season, venue, and role contact. No student rosters.

### Clubs

Sample clubs and public meeting information. No student officers or membership lists.

### Transportation

District-hosted general route zones and service notices. No home addresses, rider lists, exact individual assignments, or live vehicle locations.

### Meals

Vendor-hosted menus with meal period, items, dietary tags, and carefully worded allergen information. Make clear that dietary/allergen data is informational and should be confirmed through the school.

### Jobs

Synthetic public postings with district application links.

### News

Short synthetic announcements with canonical URLs and update dates.

### Statistics

Clearly synthetic aggregates with large enough example groups, method/provenance, and suppression example.

### APIs

Link an illustrative API catalog and OpenAPI description. Never include authentication secrets.

## Delegation scenarios

1. The school root authorizes the district origin for a transportation resource and a district jobs feed.
2. The school root authorizes a meal-service vendor for the meal-menu resource.
3. Each delegation is:
   - resource-type and resource-ID scoped;
   - origin/path restricted;
   - time bounded;
   - non-transitive;
   - revocable.
4. An invalid fixture attempts to reuse the meal delegation for jobs and must fail.

## Signatures

The rich fixture may include:

- school publication key;
- meal vendor key authorized only for menu resource;
- detached signatures;
- expired key fixture;
- revoked key fixture;
- changed-content failure fixture.

Unsigned variants remain valid in v1.

## Website demonstrations

Generate:

- school landing page data;
- department pages;
- course catalog search;
- course detail;
- program pathway;
- upcoming event list;
- menu;
- job list;
- Schema.org JSON-LD;
- printable catalog data model.

The website output is a projection, not normative protocol data.
