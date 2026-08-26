# Ecme High Ownership Plan

## Principle

Ecme High controls publication through its root manifest. Teams may own source modules, and external organizations may host explicitly delegated resources.

## Internal roles

| Team | Source responsibilities | Required approval |
|---|---|---|
| School Web and Data Office | root, organization profile, releases, signing | publication administrator |
| District Data Governance | district relationship, identifiers, statistics | school + district data reviewers |
| Curriculum Office | course architecture, programs, catalog periods | curriculum director |
| Department Chairs | department and course source under owned paths | curriculum office |
| Communications | news, events, public staff biographies | publication + privacy review |
| Activities Office | sports and clubs | communications |
| Facilities Office | public facilities/services | security/publication review |
| Food Services | meal policy and vendor review | school publication owner |
| Transportation Office | public transport data | district data + safety review |
| Human Resources | jobs and deliberately public staff data | HR/publication owner |

## Source layout

```text
source/
├── manifest/
├── organization/
├── campuses/
├── departments/
│   ├── ela/
│   ├── mathematics/
│   ├── science/
│   ├── social-studies/
│   ├── fcs/
│   ├── engineering/
│   ├── fine-arts/
│   ├── world-languages/
│   └── pe-health/
├── courses/
│   └── <same department directories>
├── programs/
├── calendar/
├── events/
├── facilities/
├── services/
├── policies/
├── admissions/
├── sports/
├── clubs/
├── delegated/
│   ├── meals/
│   ├── transportation/
│   └── jobs/
├── news/
├── statistics/
└── APIs/
```

## Approval rules

- Every change requires its path owner.
- Root, delegation, privacy policy, and keys require the publication administrator.
- Named staff requires HR/communications and privacy approval.
- Course prerequisite/credit/eligibility changes require curriculum approval.
- Transport/facility changes require safety review.
- Statistics require disclosure review.
- Generated output is never reviewed instead of source; reviewers inspect both source changes and generated diff.
- Release signing occurs only after all required approvals.

## Overlays

The example should avoid arbitrary overlays. Where an imported vendor/district candidate overlaps local data:

- imported claims live in a separate candidate namespace;
- conflicts are explicit;
- an approved decision selects the publication value;
- source ordering does not decide authority.

## Staff turnover

Named staff source records include review/expiry metadata. Role contacts remain stable when a person changes.

## Emergency corrections

The publication administrator may run an urgent privacy removal workflow. It must:

- remove public exposure quickly;
- preserve a redacted incident record;
- rotate secrets if necessary;
- invalidate affected caches/index snapshots;
- request downstream removal;
- complete retrospective review.
