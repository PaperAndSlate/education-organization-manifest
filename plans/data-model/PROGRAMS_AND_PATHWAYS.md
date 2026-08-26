# Programs, Pathways, and Sequences

## Program

A structured collection of learning opportunities leading toward an outcome.

Examples:

- graduation program;
- career pathway;
- major;
- concentration;
- certificate program;
- AP/IB program;
- dual-enrollment pathway;
- CTE sequence;
- extracurricular academy.

## Fields

- id;
- type/classification;
- name;
- description;
- provider;
- departments;
- education levels;
- eligibility;
- duration;
- total credits/workload;
- required courses;
- elective groups;
- milestones;
- outcomes;
- qualifications/certifications;
- partner organizations;
- application process;
- fees;
- modes/campuses;
- status/effective period;
- public contact;
- provenance.

## Requirement groups

Support:

- all required;
- choose N from group;
- minimum credits from group;
- one of;
- conditional branch;
- optional/recommended;
- external credential requirement.

The model should be expressive enough for catalogs but not become a full degree-audit transaction engine in v1.

## Course sequence

A pathway may define ordered stages:

```json
{
  "stages": [
    {
      "order": 1,
      "courses": [".../cul-101"]
    },
    {
      "order": 2,
      "choose": {
        "minimum": 1,
        "courses": [".../cul-201", ".../baking-201"]
      }
    }
  ]
}
```

## Outcomes

- qualification;
- industry certification eligibility;
- college credit;
- career cluster;
- progression to another program;
- local completion recognition.

Do not claim guaranteed employment or transfer unless the source explicitly supports it.

## Program offering

A future or optional layer may describe cohort-specific availability, intake dates, and capacity. Keep the reusable program definition separate.
