# Course Definitions

## Purpose

A course is a reusable educational definition independent of one timetable occurrence.

## Core fields

- id;
- type `course`;
- code;
- localized title;
- localized short and full description;
- provider organization;
- department;
- subject classifications;
- status;
- effective period.

Only ID, type, title, and provider should be broadly required. A school profile may additionally require code or local identifier.

## Detailed optional fields

### Classification

- subjects;
- topics;
- disciplines;
- education levels;
- grade/year eligibility;
- age range;
- difficulty/level;
- course category;
- honors/advanced/remedial/introductory labels;
- CTE/career cluster;
- program/pathway memberships.

### Credit and workload

- credit values, each with a credit system;
- contact hours;
- independent workload;
- duration;
- instructional weeks;
- meeting expectations;
- lab/practicum hours.

### Entry requirements

- prerequisites as structured requirements;
- corequisites;
- recommended prior learning;
- placement requirements;
- age/grade restrictions;
- permissions;
- equipment/medical/safety prerequisites only as public course requirements, never student records.

### Learning design

- learning outcomes;
- competencies;
- standards alignment;
- topics;
- major units summary;
- instructional methods;
- assessment methods;
- grading basis;
- portfolio/project/lab requirements.

### Delivery

- supported modes;
- campuses/locations;
- language of instruction;
- accessibility features;
- technology requirements;
- materials;
- textbooks/resources;
- uniform/equipment expectations;
- transport or field-trip notes.

### Cost

- course fees;
- material fees;
- waiver information;
- currency;
- effective dates.

### Credentials and progression

- qualification/credential;
- certifications;
- dual-credit partners;
- transferable credit notes;
- related courses;
- equivalent/replacement courses;
- repeatability;
- sequence position;
- next courses.

### Public catalog

- catalog year;
- display category;
- featured status;
- application/enrollment instructions;
- public contact;
- human catalog URL.

## Structured prerequisite expression

Avoid only free text.

Proposed structure:

```json
{
  "allOf": [
    {
      "course": "https://ecme-high.example/id/course/cul-101",
      "minimumResult": {
        "scheme": "https://ecme-high.example/id/grading-scale",
        "value": "C"
      }
    },
    {
      "oneOf": [
        {"educationLevel": "https://.../grade-11"},
        {"educationLevel": "https://.../grade-12"}
      ]
    }
  ],
  "display": "Culinary Arts I with a grade of C or better; grades 11–12."
}
```

Keep human display text alongside machine structure.

## Learning outcome

Fields:

- id optional;
- localized statement;
- verbs/competency reference;
- standards references;
- assessment references;
- level;
- provenance.

## Standards alignment

Reference external standard identifiers and frameworks. Do not copy licensed standard text unless permitted.

Fields:

- framework;
- item identifier;
- alignment type;
- exact/partial/broad;
- source;
- effective version.

## Course relationships

- prerequisite;
- corequisite;
- recommendedBefore;
- recommendedAfter;
- equivalent;
- replaces;
- replacedBy;
- partOfProgram;
- sharesContentWith;
- crossListedAs.

Do not use `equivalent` for approximate similarity.

## Lifecycle

- draft;
- planned;
- active;
- suspended;
- retired;
- replaced.

Historical course IDs remain resolvable.

## Search and website generation

The model should support filtering by:

- department;
- subject;
- grade/level;
- credits;
- duration;
- term availability;
- pathway;
- mode;
- prerequisite;
- fee;
- certification;
- campus.

The protocol does not prescribe UI layout.
