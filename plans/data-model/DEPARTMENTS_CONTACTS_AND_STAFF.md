# Departments, Contacts, and Staff

## Department

A department is an organizational subdivision, not merely a subject tag.

Fields:

- id;
- name;
- description;
- parent organization;
- parent department;
- subjects;
- programs;
- courses;
- campuses;
- public contact;
- leadership role contacts;
- public staff references;
- website;
- facilities;
- effective status;
- ownership metadata in source tooling.

Examples:

- Mathematics;
- Science;
- Family and Consumer Sciences;
- Student Services;
- Transportation;
- Food Services;
- Athletics;
- Human Resources.

## Role contact

Preferred public model:

```json
{
  "id": "https://ecme-high.example/id/contact/registrar",
  "type": "role-contact",
  "role": "Registrar",
  "organization": "https://ecme-high.example/id/school",
  "email": "registrar@ecme-high.example"
}
```

Role contacts survive staff turnover and reduce personal-data exposure.

## Person record

Optional and deliberately published.

Fields:

- id;
- name;
- honorifics;
- pronouns only if voluntarily/publicly provided;
- public job titles;
- departments;
- public courses/teams/clubs;
- institutional email/phone;
- profile URL;
- public image with license;
- languages;
- effective employment/publication dates;
- publication status;
- reviewedAt/expires;
- suppressFromIndex.

Prohibited:

- home address;
- personal email/phone unless an explicit extraordinary policy permits it;
- date of birth;
- payroll/HR identifiers;
- employment evaluations;
- private schedule;
- health or protected characteristics.

## Staff directory resource

Supports:

- directory title;
- organization/department scope;
- role contacts;
- people;
- alphabetical or department grouping;
- language;
- last review;
- correction contact.

## Ownership

Staff source should require:

- HR or communications ownership;
- publication owner approval;
- privacy linter;
- automated expiry review;
- deletion workflow.

## Relationship to course offerings

An offering may reference a published person or role. It should not require an instructor.

A consumer must not infer that staff omitted from the directory are not employed.

## Agents

Agent extraction should default to role contacts. Named staff candidates require an explicit review flag and evidence that the organization currently publishes the details.
