# Review and Approval Matrix

## Baseline

| Change | Author | Required domain review | Publication review | Privacy/security |
|---|---|---|---|---|
| Organization identity | Admin/data | District/org owner | Yes | Identity check |
| Campus | Admin/facilities | Facilities | Yes | Security review |
| Course | Department | Curriculum | Yes | Basic |
| Offering | Scheduling dept | Curriculum | Yes | Staff schedule warning |
| Program | Program owner | Curriculum | Yes | Basic |
| Staff | HR/comms | HR | Yes | Mandatory |
| Contact role | Domain owner | Admin | Yes | Personal-data check |
| Calendar/event | Comms/admin | Calendar owner | Depending policy | Basic |
| Transport | Transport | District data | Yes | Mandatory |
| Meals | Food service/vendor | Food service | Yes/monitor | Safety/privacy |
| Sports/clubs | Activity owner | Comms | Yes | Student/staff check |
| Jobs | HR | HR | Yes | Personal-data check |
| Statistics | Data team | Governance | Yes | Disclosure control |
| Delegation | Platform owner | Legal/vendor owner | Mandatory | Security |
| Signing keys | Security | Security | Mandatory | Two-person |
| Schema/spec | Contributor | Editors | Maintainer | Required sections |

## Machine-enforced gates

- path ownership;
- schema validation;
- semantic validation;
- privacy linter;
- evidence completeness;
- stale data;
- signature tests;
- generated diff;
- module-specific checklist.

## Human-only judgments

- factual accuracy;
- appropriateness of staff publication;
- licensing;
- security sensitivity;
- legal authority;
- wording quality;
- whether a conflict is resolved.

## Approval evidence

PR template records:

- reviewers;
- source evidence;
- privacy acknowledgement;
- effective dates;
- publication owner;
- deployment link.
