# Module Registry Plan

## Purpose

The module registry lets consumers discover stable module IDs, schemas, profiles, freshness guidance, and privacy classification.

## Registry fields

- module URI;
- short name;
- title;
- description;
- resource type;
- schema URI;
- current version;
- compatible protocol versions;
- status;
- change controller;
- privacy class;
- recommended freshness;
- collection behavior;
- example;
- conformance profile;
- extension points;
- mappings;
- last reviewed.

## Core v1 modules

| Module | Resource type | Privacy class | Typical freshness |
|---|---|---:|---|
| Organization | organization-profile | public-reviewed | days |
| Campuses | campus-catalog | public-reviewed | days |
| Departments | department-catalog | public-reviewed | days |
| Staff | staff-directory | personal-public | days |
| Contacts | contact-directory | personal-public | days |
| Courses | course-catalog | public-reviewed | days |
| Offerings | course-offering-catalog | public-reviewed | hours/days |
| Programs | program-catalog | public-reviewed | days |
| Calendar | academic-calendar | public | hours |
| Events | event-catalog | public | minutes/hours |
| Facilities | facility-catalog | public-security-review | days |
| Services | service-catalog | public-reviewed | days |
| Policies | policy-catalog | public | days |
| Admissions | admissions-profile | public | hours/days |
| Sports | sports-catalog | personal-public | hours |
| Transport | transportation-catalog | public-security-review | minutes/hours |
| Meals | meal-menu-catalog | public-safety-reviewed | minutes/hours |
| Clubs | club-catalog | personal-public | hours/days |
| Jobs | job-catalog | public-personal | minutes/hours |
| News | news-feed | public | minutes |
| Statistics | statistics-profile | aggregate-sensitive | source-dependent |
| APIs | api-reference | public-security-review | days |

## Registry governance

- new module requires RFC;
- schemas immutable by version;
- privacy review required;
- experimental modules cannot be required by stable profiles;
- deprecated modules retain documentation and migration path;
- vendor extensions may register informatively without becoming core.
