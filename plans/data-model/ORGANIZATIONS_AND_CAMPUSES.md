# Organizations and Campuses

## Organization types

The core type registry should support:

- educational-organization;
- school;
- early-childhood-provider;
- primary-school;
- middle-school;
- secondary-school;
- all-through-school;
- special-school;
- alternative-school;
- online-school;
- charter-school;
- private-school;
- public-school;
- district;
- local-education-agency;
- education-authority;
- college;
- university;
- technical-college;
- vocational-provider;
- adult-education-provider;
- training-provider;
- examination-body;
- accreditation-body;
- consortium;
- campus organization;
- other namespaced type.

Types can be combined through `classifications` rather than one giant enum.

## Organization profile fields

### Identity

- id;
- legal name;
- preferred/public name;
- alternate names;
- former names;
- identifiers;
- organization types/classifications;
- lifecycle/status;
- founding/closure dates.

### Relationships

- parent organization;
- sub-organizations;
- member organizations;
- governing organizations;
- operator;
- owner;
- affiliated organizations;
- successor/predecessor;
- campuses operated.

### Public description

- short description;
- full description;
- mission;
- motto;
- logo and brand assets;
- website;
- social links.

### Geography

- addresses;
- service areas;
- geocoordinates;
- attendance/catchment boundary resource link;
- remote/online status.

### Education

- education levels;
- age ranges;
- grades/year groups;
- education modes;
- languages of instruction;
- academic calendar references;
- departments;
- programs;
- accreditations;
- qualifications offered.

### Governance and classification

- public/private/nonprofit/for-profit;
- governing authority;
- jurisdiction;
- funding model;
- religious or philosophical affiliation only when deliberately published and legally appropriate;
- accreditation;
- school code/classification profiles.

### Contact

- main public contact;
- admissions;
- registrar;
- data correction;
- accessibility;
- media;
- emergency public information URL.

### Accessibility

- accessibility statement;
- physical accessibility summary;
- digital accessibility statement;
- accommodation contact;
- language access.

### Public operational information

- opening hours;
- term dates links;
- enrollment/admissions links;
- handbooks;
- policies;
- facilities;
- services.

### Aggregate facts

- enrollment counts;
- staffing counts;
- attendance/ratings only as separate sourced statistics, not unqualified top-level claims.

## Campus entity

A campus is a site operated by an organization.

Fields:

- id;
- name;
- campus type;
- operator organization;
- organizations served;
- address;
- geo;
- time zone;
- contact;
- facilities;
- accessibility;
- hours;
- virtual/physical/hybrid;
- active/effective dates;
- public arrival/visitor instructions.

Do not publish security-sensitive entrance or access-control details.

## District example

A district manifest may include:

- district organization profile;
- organization index;
- shared transportation resource;
- shared meal-service resource;
- shared calendar;
- member school profiles;
- delegation to individual school domains for course catalogs.

## School-on-district-domain example

The organization profile canonical URL may be:

`https://district.example/schools/ecme-high`

while its stable ID is:

`https://district.example/id/school/ecme-high`

The district origin well-known manifest links it through the organization index.
